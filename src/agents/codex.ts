import type { AgentRuntimeConfig } from "../types/agent";
import { commandFromArgs } from "../utils/shell";
import { BaseAgentAdapter } from "./base";
import type { PromptContext } from "./adapter";

export class CodexAdapter extends BaseAgentAdapter {
  constructor(config: AgentRuntimeConfig) {
    super("codex", "Codex", config);
  }

  protected buildCommand(context: PromptContext): string {
    return commandFromArgs([
      this.config.cliPath ?? "codex",
      "exec",
      "--skip-git-repo-check",
      "--color",
      "never",
      this.buildPrompt(context),
    ]);
  }
}
