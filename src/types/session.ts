import type { AgentId } from "./agent";

export interface SessionState {
  id: string;
  createdAt: string;
  tmuxSessionName: string;
  panes: Record<string, string>;
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
}

export interface Judgement {
  summary: string;
  comparison: string;
  recommendedAgent?: AgentId;
  scores: Record<AgentId, number>;
}
