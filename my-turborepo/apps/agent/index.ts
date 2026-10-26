import type {
  ChatFunctionTool,
  ChatMessages,
  ChatResult,
  ChatToolCall,
} from "@openrouter/sdk/models";

import { OpenRouter } from "@openrouter/sdk";

import { resolve } from "node:path";
import { $ } from "bun"; // suggested by gpt

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const openrouter = new OpenRouter({
  apiKey: OPENROUTER_API_KEY,
});

const TODO_APP_PATH = resolve(import.meta.dir, "../../todo-app");

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
];

// when llm asks us to do commands ---> its our agents job to run those commands
async function runBash(command: string) {
  // const result = await Bun.`bash -c ${command}`.nothrow().quiet();
  const result = await $`bash -c ${command}`.nothrow().quiet(); // suggested by gpt

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
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
    // content: `Can you tell me more about the project ${TODO_APP_PATH}`,
    content: `In ${TODO_APP_PATH}, create frontend/index.html.
  Make it a simple, attractive, single-file HTML page
  explaining that this is a Todo App project.
  Include a title, short description, and sample todo list.
  Use inline CSS. No JavaScript, frameworks, or npm packages.
  Create the frontend folder if needed.
  Use bash commands to create the file, then verify it exists.
  Keep the task simple.`,
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
  //throw error if any other tool call is there than "bash"
  if (toolcall.function.name !== "bash") {
    throw new Error(`Unknown tool: ${toolcall.function.name}`);
  }

  const { command } = JSON.parse(toolcall.function.arguments) as {
    command: string;
  };

  console.log(`$ ${command}`);

  const toolResult = await runBash(command);

  return {
    role: "tool",
    toolCallId: toolcall.id,
    content: JSON.stringify(toolResult),
  };
}

const maxIterations = 10;
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
