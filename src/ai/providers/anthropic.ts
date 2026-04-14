import type { AIProvider, AIMessage, AIOptions } from "../types.js";

export class AnthropicProvider implements AIProvider {
  name = "anthropic";
  private apiKey: string;
  private defaultModel: string;

  constructor(config: { apiKey: string; model?: string }) {
    this.apiKey = config.apiKey;
    this.defaultModel = config.model || "claude-sonnet-4-6";
  }

  async *chat(
    messages: AIMessage[],
    options?: AIOptions
  ): AsyncIterable<string> {
    // Separate system message from conversation
    const systemMessage = messages.find((m) => m.role === "system");
    const conversationMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || 4096,
        system: systemMessage?.content,
        messages: conversationMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${error}`);
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

        try {
          const parsed = JSON.parse(data);
          if (
            parsed.type === "content_block_delta" &&
            parsed.delta?.type === "text_delta"
          ) {
            yield parsed.delta.text;
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }
  }

  async models(): Promise<string[]> {
    return [
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-haiku-4-5-20251001",
    ];
  }
}
