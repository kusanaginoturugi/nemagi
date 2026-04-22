import type { AgentRuntimeConfig } from "../types/agent";
import { commandFromArgs } from "../utils/shell";
import { BaseAgentAdapter } from "./base";
import type { PromptContext } from "./adapter";

export class ClaudeAdapter extends BaseAgentAdapter {
  constructor(config: AgentRuntimeConfig) {
    super("claude", "Claude", config);
  }

  protected buildCommand(context: PromptContext): string {
    return commandFromArgs([
      this.config.cliPath ?? "claude",
      "-p",
      "--output-format",
      "text",
      this.buildPrompt(context),
    ]);
  }
}
