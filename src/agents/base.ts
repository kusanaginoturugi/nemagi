import type { AgentRuntimeConfig } from "../types/agent";
import type { AgentAdapter, AgentExecutionPlan, PromptContext } from "./adapter";

export abstract class BaseAgentAdapter implements AgentAdapter {
  constructor(
    public readonly id: "codex" | "claude" | "gemini",
    public readonly displayName: string,
    protected readonly config: AgentRuntimeConfig,
  ) {}

  buildExecutionPlan(context: PromptContext): AgentExecutionPlan {
    return {
      agentId: this.id,
      displayName: this.displayName,
      shellCommand: this.buildCommand(context),
      completionPolicy: {
        mode: this.config.mode,
        maxWaitMs: this.config.maxWaitMs,
        silenceTimeoutMs: this.config.silenceTimeoutMs,
        idlePattern: this.config.idlePattern,
      },
    };
  }

  protected buildPrompt(context: PromptContext): string {
    if (!context.priorJudgeSummary) {
      return context.prompt;
    }

    return [
      "Previous turn summary:",
      context.priorJudgeSummary.trim(),
      "",
      "Current request:",
      context.prompt,
    ].join("\n");
  }

  protected abstract buildCommand(context: PromptContext): string;
}
