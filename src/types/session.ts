import type { AgentId } from "./agent";

export interface SessionState {
  id: string;
  createdAt: string;
  mode: "process-tui";
  agents: AgentId[];
}

export interface TurnState {
  id: string;
  prompt: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "timed_out" | "failed";
}

export interface ResponseChunk {
  seq: number;
  ts: string;
  chunk: string;
}

export interface AgentResponse {
  agentId: AgentId;
  status: "running" | "completed" | "timed_out" | "failed";
  output: string;
  chunks: ResponseChunk[];
  exitCode?: number;
  error?: string;
  diagnostics?: string;
}

export interface Judgement {
  summary: string;
  comparison: string;
  recommendedAgent?: AgentId;
  scores: Record<AgentId, number>;
  consensusAnswer?: string;
  supportingAgents: AgentId[];
  dissentingAgents: AgentId[];
  consensusStrength: "strong" | "mixed" | "weak";
  majorityApplicable: boolean;
  needsHumanReview: boolean;
  judgeReason: string;
  provider: "ollama" | "heuristic";
  model?: string;
}
