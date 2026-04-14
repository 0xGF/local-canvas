import type { AIProvider, AIConfig } from "./types.js";
import { OpenAIProvider } from "./providers/openai.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { existsSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { homedir } from "os";

export class AIManager {
  private provider: AIProvider | null = null;

  constructor(projectRoot?: string) {
    const config = this.loadConfig(projectRoot);
    if (config) {
      this.provider = this.createProvider(config);
    }
  }

  getProvider(): AIProvider | null {
    return this.provider;
  }

  setProvider(config: AIConfig): void {
    this.provider = this.createProvider(config);
  }

  private createProvider(config: AIConfig): AIProvider {
    switch (config.provider) {
      case "openai":
        return new OpenAIProvider({
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.model,
        });
      case "anthropic":
        return new AnthropicProvider({
          apiKey: config.apiKey,
          model: config.model,
        });
      default:
        throw new Error(`Unknown AI provider: ${config.provider}`);
    }
  }

  private loadConfig(projectRoot?: string): AIConfig | null {
    // Check project-level config first
    if (projectRoot) {
      const projectConfig = resolve(
        projectRoot,
        ".local-canvas.json"
      );
      if (existsSync(projectConfig)) {
        try {
          const raw = readFileSync(projectConfig, "utf-8");
          const parsed = JSON.parse(raw);
          if (parsed.ai) return parsed.ai as AIConfig;
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Check user-level config
    const userConfig = join(homedir(), ".local-canvas", "config.json");
    if (existsSync(userConfig)) {
      try {
        const raw = readFileSync(userConfig, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.ai) return parsed.ai as AIConfig;
      } catch {
        // Ignore parse errors
      }
    }

    // Check environment variables
    if (process.env.OPENAI_API_KEY) {
      return {
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL,
        model: process.env.OPENAI_MODEL,
      };
    }

    if (process.env.ANTHROPIC_API_KEY) {
      return {
        provider: "anthropic",
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.ANTHROPIC_MODEL,
      };
    }

    return null;
  }
}
