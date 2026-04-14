import type { AIProvider, AIMessage, AIOptions } from "../types.js";

export class OpenAIProvider implements AIProvider {
  name = "openai";
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: {
    apiKey: string;
    baseUrl?: string;
    model?: string;
  }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://api.openai.com/v1";
    this.defaultModel = config.model || "gpt-4o";
  }

  async *chat(
    messages: AIMessage[],
    options?: AIOptions
  ): AsyncIterable<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || this.defaultModel,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature ?? 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Skip malformed chunks
        }
      }
    }
  }

  async models(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) return [this.defaultModel];

    const data = await response.json();
    return data.data
      ?.map((m: any) => m.id)
      .filter((id: string) => id.includes("gpt") || id.includes("claude"))
      .sort() || [this.defaultModel];
  }
}
