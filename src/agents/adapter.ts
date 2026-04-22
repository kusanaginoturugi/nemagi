import type { AgentId, CompletionPolicy } from "../types/agent";

export interface PromptContext {
  prompt: string;
  priorJudgeSummary?: string;
}

export interface AgentExecutionPlan {
  agentId: AgentId;
  displayName: string;
  shellCommand: string;
  completionPolicy: CompletionPolicy;
}

export interface AgentAdapter {
  readonly id: AgentId;
  readonly displayName: string;
  buildExecutionPlan(context: PromptContext): AgentExecutionPlan;
}
