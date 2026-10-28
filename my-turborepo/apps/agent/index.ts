import type {
  ChatFunctionTool,
  ChatMessages,
  ChatResult,
  ChatToolCall,
} from "@openrouter/sdk/models";
import { OpenRouter } from "@openrouter/sdk";
import { Sandbox, CommandExitError } from "e2b";

// import { $ } from "bun"; // suggested by gpt

import { createInstallationToken, getAppBotIdentity } from "./github.ts";

// ---------------------------------- Sanbox, OpenRouter and Github App Connetor creation ----------------------------------

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const E2B_API_KEY = process.env.E2B_API_KEY;
const { GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY_PATH, GITHUB_INSTALLATION_ID } =
  process.env;

if (!OPENROUTER_API_KEY) {
  throw new Error("set OPENROUTER_API_KEY in apps/agent/.env");
}

if (!E2B_API_KEY) {
  throw new Error("set E2B_API_KEY in apps/agent/.env");
}

if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY_PATH || !GITHUB_INSTALLATION_ID) {
  throw new Error(
    "Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY_PATH and GITHUB_INSTALLATION_ID in apps/agent/.env",
  );
}

// create openrouter
const openrouter = new OpenRouter({
  apiKey: OPENROUTER_API_KEY,
});

// github connetor
const REPO_OWNER = "developer-G-2";
const REPO_NAME = "Prediction-Market";
const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
const REPO_PATH = "/home/user/Market-Prediction-App-Kalshi";

const githubApp = {
  appId: GITHUB_APP_ID,
  privateKey: await Bun.file(GITHUB_APP_PRIVATE_KEY_PATH).text(),
};

console.log("Minting GitHub installation token...");

const githubToken = await createInstallationToken(
  githubApp,
  GITHUB_INSTALLATION_ID,
  REPO_NAME,
);
const botIdentity = await getAppBotIdentity(githubApp, githubToken.token);

console.log(`GitHub token expires at ${githubToken.expiresAt}`);

// create sandbox
console.log("Starting sandbox...");

const startTime = Date.now();
const sandbox = await Sandbox.create({
  envs: { GITHUB_TOKEN: githubToken.token, GH_TOKEN: githubToken.token },
});

console.log(
  `It took ${(Date.now() - startTime) / 1000} seconds to start the sandbox.`,
);
console.log(`Sandbox started: ${sandbox.sandboxId}`);

// read the token from the env at use time so it is never written into .git/config
await sandbox.commands.run(
  [
    `git config --global credential.helper '!f() { echo username=x-access-token; echo "password=$GITHUB_TOKEN"; }; f'`,
    `git config --global user.name '${botIdentity.name}'`,
    `git config --global user.email '${botIdentity.email}'`,
  ].join(" && "),
);

// const TODO_APP_PATH = resolve(import.meta.dir, "../../todo-app"); // TODO_APP_PATH used in local agent setup

// clone repo on sandbox by running following command in sandbox
console.log(`Cloning ${REPO_URL}...`);
await sandbox.commands.run(`git clone --depth 1 ${REPO_URL} ${REPO_PATH}`, {
  timeoutMs: 120_000,
});

// ---------------------------------- ChatFunctionTool -> goes to the llm ----------------------------------

// base Tools
const baseTools: ChatFunctionTool[] = [
  // bash tool
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
  // read_file tool
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

// sub-agent tool
const subAgentTool: ChatFunctionTool = {
  type: "function",
  function: {
    name: "sub_agent",
    description:
      "Delegate a difficult, self-contained task (deep investigation, multi-step analysis, tracing logic across many files) to a sub-agent. The sub-agent has its own fresh context and the same bash/read_file tools, but cannot see this conversation, so describe the task and any relevant context fully. Returns the sub-agent's final report.",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description:
            "A complete, standalone description of what the sub-agent should do and what it should report back.",
        },
      },
      required: ["task"],
    },
  },
};

// mainTools
// the sub-agent only gets the base tools, so it can't spawn sub-agents of its own
const mainTools: ChatFunctionTool[] = [...baseTools, subAgentTool];

// ---------------------------------- runBash, runReadFile  ----------------------------------
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

// ---------------------------------- ChatMessages----------------------------------
// first 2 messages goes to the llm call

const messages: ChatMessages[] = [
  {
    role: "system",
    content: `You are a helpful coding agent running inside a sandbox. Use the bash tool to explore files before answering questions about them. For difficult, self-contained subtasks (deep investigations, tracing logic across many files), delegate to the sub_agent tool with a complete task description. The working directory is ${REPO_PATH}, a clone of ${REPO_OWNER}/${REPO_NAME}. Git is authenticated, so you can push branches to origin. To open a pull request, push a new branch (never push to the default branch) and call the GitHub API with the token in $GITHUB_TOKEN, e.g. curl -X POST -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls -d '{"title":"...","head":"<branch>","base":"<default branch>","body":"..."}'. Never print or log the token.`,
  },
  {
    role: "user",
    content: `Can you please create style.css file, use existing classes mentioned in index.html. No need to spend too much time doing it. ${REPO_PATH}.`,
  },
];

// ---------------------------------- callLLM----------------------------------
// callLLM ----> wrapper on top of "openrouter.chat.send" ---> this send req to model ---> get back the response ---> at the end stores response in [messages] --> this message is the LLM memory

async function callLLM(
  messages: ChatMessages[],
  tools: ChatFunctionTool[],
): Promise<ChatResult> {
  const result = await openrouter.chat.send({
    chatRequest: {
      model: "google/gemini-3-flash-preview",
      tools,
      messages,
      maxTokens: 1000, //reduces the maximum size of each generated response. It can reduce the estimated cost of a request, but may be too small for a detailed security report.
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

// ---------------------------------- ChatToolCall----------------------------------
// runTool
async function runTool(toolCall: ChatToolCall, tools: ChatFunctionTool[]) {
  const name = toolCall.function.name;

  // validate tools
  if (
    !tools.some((tool) => "function" in tool && tool.function.name === name)
  ) {
    return { exitCode: 1, stdout: "", stderr: `Unknown tool: ${name}` };
  }

  // sub_agent tool
  if (name === "sub_agent") {
    const { task } = JSON.parse(toolCall.function.arguments) as {
      task: string;
    };

    console.log(`Tool: SubAgent > ${task}`);

    return { result: await runSubAgent(task) };
  }

  // handle timeouts --- if any tool took more than 5 sec to resolve, then resolve that with timeout warning
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<{ stdout: string }>((resolve) => {
    timer = setTimeout(() => {
      console.log("timeout received");
      resolve({ stdout: "Timeout while running the tool" });
    }, 30000);
  });

  // toolcall's executions
  const run = async () => {
    // 1. bash tool - runBash
    if (name === "bash") {
      const { command } = JSON.parse(toolCall.function.arguments) as {
        command: string;
      };
      console.log(`Tool: Bash $ ${command}`);
      return runBash(command);
    }

    // 2. read_file tool - runReadFile
    const { path } = JSON.parse(toolCall.function.arguments) as {
      path: string;
    };
    console.log(`Tool: ReadFile ${path}`);
    return runReadFile(path);
  };

  try {
    return await Promise.race([run(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// it get a toolcall ---> forwards that req to mentioned toolcall
// getToolResponse
async function getToolResponse(
  toolcall: ChatToolCall,
  tools: ChatFunctionTool[],
): Promise<ChatMessages> {
  return {
    role: "tool",
    toolCallId: toolcall.id,
    content: JSON.stringify(await runTool(toolcall, tools)),
  };
}

// ---------------------------------- Agent Loop + Context Engineering (Compaction, Summarization, Sub-agent tool) ----------------------------------
// system prompt + original user task are always kept verbatim (exactly as it was spoken or written)

const MAX_CONTEXT_TOKENS = 80_000; // makes your agent summarize its conversation history much earlier instead of allowing it to grow past 30,000 tokens before compaction.
const PINNED_MESSAGE_COUNT = 2;

// summarizeMessages
async function summarizeMessages(messages: ChatMessages[]) {
  const pinned = messages.slice(0, PINNED_MESSAGE_COUNT);
  const history = messages.slice(PINNED_MESSAGE_COUNT);

  if (history.length == 0) {
    return;
  }

  console.log(`Summarizing ${history.length} messages...`);

  // make call to LLM for summarizing hirstory messages
  const result = await openrouter.chat.send({
    chatRequest: {
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "You compress the working history of a coding agent so it can continue its task. Write a concise but complete summary covering: what has been explored, commands run and their key results, important file paths and contents/findings, decisions made, and what remains to be done. Do not drop facts the agent will need to finish the task.",
        },
        {
          role: "user",
          content: `Original task:\n${JSON.stringify(pinned[1]?.content)}\n\nHistory to summarize:\n${JSON.stringify(history)}`,
        },
      ],
      stream: false,
    },
  });

  if (!("choices" in result)) {
    throw new Error("Expected a non-streaming response");
  }

  const summary = result.choices[0]?.message.content;

  if (!summary) {
    throw new Error("Expected the model to return a summary");
  }

  // keep 1st 2 messages -> and remove old history messages -> then add newly summarised response
  messages.splice(PINNED_MESSAGE_COUNT, history.length, {
    role: "user",
    content: `Summary of your progress so far (earlier messages were compacted to save context):\n\n${typeof summary === "string" ? summary : JSON.stringify(summary)}\n\nContinue the task from here.`,
  });
}

// runAgent
async function runAgent(
  messages: ChatMessages[],
  tools: ChatFunctionTool[],
  maxIterations: number,
  label: string,
) {
  let iterationCount = 0;

  // agent loop
  while (iterationCount < maxIterations) {
    iterationCount++;

    const response = await callLLM(messages, tools);

    // start : cloud agent new code
    const contextTokens =
      (response.usage?.promptTokens ?? 0) +
      (response.usage?.completionTokens ?? 0);

    console.log(
      `[${label}] Iteration ${iterationCount}: context ${contextTokens} tokens`,
    );

    // end : cloud agent new code

    const choice = response.choices[0];

    // console.log("Finish reason:", choice?.finishReason);
    // console.log("Full model message:");
    // console.dir(choice?.message, { depth: null });

    // console.log("Content:", choice?.message.content);
    // console.log("Tool calls:", choice?.message.toolCalls);
    // console.log("Usage:", response.usage);

    if (!choice) {
      throw new Error(`Expected a model to return a choice`);
    }

    const toolCalls = choice.message.toolCalls;

    // llm done doing everything ---> llm has all context llm wants to generate response ---> so no toolcall anymore ---> then break
    if (!toolCalls || toolCalls.length == 0) {
      return choice.message.content;
    }

    // push every toolcall's response in messages
    for (const toolCall of toolCalls) {
      messages.push(await getToolResponse(toolCall, tools));
    }

    // start : cloud agent new code
    if (contextTokens > MAX_CONTEXT_TOKENS) {
      await summarizeMessages(messages);
      console.log(messages);
    }
    // end : cloud agent new code
  }

  console.warn(`[${label}] Warning: Maximum iterations reached`);
  return messages[messages.length - 1]?.content;
}

// runSubAgent
async function runSubAgent(task: string) {
  const subMessages: ChatMessages[] = [
    {
      role: "system",
      content: `You are a sub-agent of a coding agent, running inside a sandbox. You have been delegated one specific task. Use the bash and read_file tools to complete it thoroughly. The working directory is ${REPO_PATH}. When you are done, reply with a complete, self-contained report of your findings or results - it is the only thing the main agent will see.`,
    },
    {
      role: "user",
      content: task,
    },
  ];

  const result = await runAgent(subMessages, baseTools, 20, "sub-agent");
  console.log(`[sub-agent] Done`);
  return result ?? "The sub-agent did not produce a result.";
}
// ---------------------------------- Ending work ----------------------------------

// call runAgent: print final response returned by llm
const finalAnswer = await runAgent(messages, mainTools, 40, "main");
console.log(finalAnswer);

// at the end kill sanbox
await sandbox.kill();
