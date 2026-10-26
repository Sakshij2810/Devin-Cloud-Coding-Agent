import type {
  ChatFunctionTool,
  ChatMessages,
  ChatResult,
  ChatToolCall,
} from "@openrouter/sdk/models";

import { OpenRouter } from "@openrouter/sdk";

import { resolve } from "node:path";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

console.log("OPENROUTER_API_KEY : ", OPENROUTER_API_KEY);

const openrouter = new OpenRouter({
  apiKey: OPENROUTER_API_KEY,
});

const TODO_APP_PATH = resolve(import.meta.dir, "../../todo-app");

const tools: ChatFunctionTool[] = [];

async function runBash(command: string) {
  // const result = await Bun.`bash -c ${command}`.nothrow().quiet();
  const result = await $`bash -c ${command}`.nothrow().quiet();

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}
