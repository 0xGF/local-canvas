export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIProvider {
  name: string;
  chat(messages: AIMessage[], options?: AIOptions): AsyncIterable<string>;
  models(): Promise<string[]>;
}

export interface AIConfig {
  provider: "openai" | "anthropic";
  apiKey: string;
  model?: string;
  baseUrl?: string;
}
