import OpenAI from "openai";
import { AppConfig } from "./types.js";

export function createLLM(config: AppConfig) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    defaultHeaders: {
    },
  });

  async function chat(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    options?: { temperature?: number; maxTokens?: number; json?: boolean }
  ): Promise<string> {
    const response = await client.chat.completions.create({
      model: config.model,
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 4096,
      ...(options?.json ? { response_format: { type: "json_object" } } : {}),
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response from LLM");
    return content;
  }

  return { chat, client };
}

export type LLM = ReturnType<typeof createLLM>;
