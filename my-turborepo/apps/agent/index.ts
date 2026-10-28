import type {
  ChatFunctionTool,
  ChatMessages,
  ChatResult,
  ChatToolCall,
} from "@openrouter/sdk/models";

import { OpenRouter } from "@openrouter/sdk";
import { Sandbox, CommandExitError } from "e2b";

import { resolve } from "node:path";
import { $ } from "bun"; // suggested by gpt
import { exitCode, stdout } from "node:process";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const E2B_API_KEY = process.env.E2B_API_KEY;

if (!OPENROUTER_API_KEY) {
  throw new Error("set OPENROUTER_API_KEY in apps/agent/.env");
}

if (!E2B_API_KEY) {
  throw new Error("set E2B_API_KEY in apps/agent/.env");
}

// create openrouter
const openrouter = new OpenRouter({
  apiKey: OPENROUTER_API_KEY,
});

const TODO_APP_PATH = resolve(import.meta.dir, "../../todo-app");

// create sandbox
console.log("Starting sandbox...");

const startTime = Date.now();
const sandbox = await Sandbox.create();

console.log(
  `It took ${(Date.now() - startTime) / 1000} seconds to start the sandbox.`,
);
console.log(`Sandbox started: ${sandbox.sandboxId}`);

const REPO_URL = "https://github.com/Sakshij2810/Market-Prediction-App-Kalshi-";
const REPO_PATH = "/home/user/Market-Prediction-App-Kalshi";

// clone repo on sandbox by running following command in sandbox
console.log(`Cloning ${REPO_URL}...`);
await sandbox.commands.run(`git clone --depth 1 ${REPO_URL} ${REPO_PATH}`, {
  timeoutMs: 120_000,
});

// ChatFunctionTool -> goes to the llm
const tools: ChatFunctionTool[] = [
  {
    type: "function",
    function: {
      name: "bash",
      description:
        "Run a bash command and return its stdout, stderr and exit code.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
          },
        },
        required: ["command"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the file at the given path.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
          },
        },
        required: ["path"],
      },
    },
  },
];

// when llm asks us to do commands ---> its our agents job to run those commands

// runBash
async function runBash(command: string) {
  try {
    // const result = await Bun.`bash -c ${command}`.nothrow().quiet(); // originial tutorial

    // 1. approach:  for local coding agent use this
    // const result = await $`bash -c ${command}`.nothrow().quiet(); // suggested by gpt

    // 2. approach:  for cloud coding agent use this
    const result = await sandbox.commands.run(command, { cwd: REPO_PATH });

    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  } catch (error) {
    // commands.run throws on a non-zero exit code; pass it back to the model as a result
    if (error instanceof CommandExitError) {
      return {
        exitCode: error.exitCode,
        stdout: error.stdout.toString(),
        stderr: error.stderr.toString(),
      };
    }
    throw error;
  }
}

// runReadFile
async function runReadFile(path: string) {
  try {
    // const result = await Bun.`cat ${path}`.nothrow().quiet(); // originial tutorial

    // 1. approach:  for local coding agent use this
    // const result = await $`cat ${path}`.nothrow().quiet(); // suggested by gpt
    // return {
    //   exitCode: result.exitCode,
    //   stdout: result.stdout.toString(),
    //   stderr: result.stderr.toString(),
    // };

    // 2. approach:  for cloud coding agent use this
    const content = await sandbox.files.read(path);

    return {
      exitCode: 0,
      stdout: content,
      stderr: "",
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: String(error),
    };
  }
}

// first 2 messages goes to the llm call
const messages: ChatMessages[] = [
  {
    role: "system",
    content:
      "You are a helpful coding agent. Use the bash tool to explore files before answering questions about them.",
  },
  {
    role: "user",
    content: `Can you tell me more about the project ${TODO_APP_PATH}`,
  },
];

// callLLM ----> wrapper on top of "openrouter.chat.send" ---> this send req to model ---> get back the response ---> at the end stores response in [messages] --> this message is the LLM memory
async function callLLM(messages: ChatMessages[]): Promise<ChatResult> {
  const result = await openrouter.chat.send({
    chatRequest: {
      model: "google/gemini-3-flash-preview",
      tools,
      messages,
      maxTokens: 1500,
      stream: false,
    },
  });

  if (!("choices" in result)) {
    throw new Error(`Expected a non-streaming response`);
  }

  const choice = result.choices[0];

  if (!choice) {
    throw new Error(`Expected a model to return a choice`);
  }

  messages.push(choice.message);
  return result;
}

// it get a toolcall ---> forwards that req to mentioned toolcall
async function getToolResponse(toolcall: ChatToolCall): Promise<ChatMessages> {
  let isResolved = false;
  return new Promise(async (resolve, reject) => {
    // handle timeouts --- if any tool took more than 5 sec to resolve, then resolve that with timeout warning
    const timer = setTimeout(() => {
      if (!isResolved) {
        console.log("Timeout received");

        resolve({
          role: "tool",
          toolCallId: toolcall.id,
          content: JSON.stringify({
            stdOut: "Warning: Timeout while running this tool",
          }),
        });
      }
    }, 5000);

    // toolcall's executions

    // 1. bash tool
    if (toolcall.function.name === "bash") {
      const { command } = JSON.parse(toolcall.function.arguments) as {
        command: string;
      };

      console.log(`$ bash :  ${command}`);

      const toolResult = await runBash(command);

      isResolved = true;
      clearTimeout(timer);
      resolve({
        role: "tool",
        toolCallId: toolcall.id,
        content: JSON.stringify(toolResult),
      });
    }
    // 2. read_file tool
    else if (toolcall.function.name === "read_file") {
      const { path } = JSON.parse(toolcall.function.arguments) as {
        path: string;
      };

      console.log(`$ readFile : ${path}`);

      const toolResult = await runReadFile(path);

      isResolved = true;
      clearTimeout(timer);
      resolve({
        role: "tool",
        toolCallId: toolcall.id,
        content: JSON.stringify(toolResult),
      });
    }
  });
}

const maxIterations = 20;
let iterationCount = 0;
let didReachMaxIterations = true;

// agent loop
while (iterationCount < maxIterations) {
  iterationCount++;

  const response = await callLLM(messages);
  const choice = response.choices[0];

  if (!choice) {
    throw new Error(`Expected a model to return a choice`);
  }

  const toolCalls = choice.message.toolCalls;

  // llm done doing everything ---> llm has all context llm wants to generate response ---> so no toolcall anymore ---> then break
  if (!toolCalls || toolCalls.length == 0) {
    didReachMaxIterations = false;
    break;
  }

  // push every toolcall's response in messages
  for (const toolCall of toolCalls) {
    messages.push(await getToolResponse(toolCall));
  }
}

if (didReachMaxIterations) {
  console.warn("Warning: Maximum iterations reached");
}

// print final response returned by llm
console.log(messages[messages.length - 1]?.content);

// at the end kill sanbox
await sandbox.kill();
