import { ChatOllama } from "@langchain/ollama";
import type { AppConfig } from "../config.js";
import type { LlmProvider } from "./llmProvider.js";

export function createOllamaProvider(config: AppConfig): LlmProvider {
  return {
    model: new ChatOllama({
      model: config.ollamaModel,
      baseUrl: config.ollamaBaseUrl,
      temperature: 0.1,
      format: "json",
      numPredict: 1024
    })
  };
}
