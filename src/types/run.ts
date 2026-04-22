import type { AgentId, CompletionPolicy } from "./agent";

export interface RunHandle {
  agentId: AgentId;
  paneId: string;
  startMarker: string;
  endMarker: string;
  completionPolicy: CompletionPolicy;
}
