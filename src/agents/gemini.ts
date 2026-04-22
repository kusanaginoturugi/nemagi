import type { AgentRuntimeConfig } from "../types/agent";
import { commandFromArgs } from "../utils/shell";
import { BaseAgentAdapter } from "./base";
import type { PromptContext } from "./adapter";

export class GeminiAdapter extends BaseAgentAdapter {
  constructor(config: AgentRuntimeConfig) {
    super("gemini", "Gemini", config);
  }

  protected buildCommand(context: PromptContext): string {
    return commandFromArgs([
      this.config.cliPath ?? "gemini",
      "--prompt",
      this.buildPrompt(context),
      "--output-format",
      "text",
    ]);
  }
}
