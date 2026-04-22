import type { AgentId } from "./agent";
import type { AgentResponse, Judgement, TurnState } from "./session";

export interface RunObserver {
  onTurnStarted?(turn: TurnState): void;
  onAgentStarted?(agentId: AgentId, displayName: string): void;
  onAgentChunk?(agentId: AgentId, chunk: string): void;
  onAgentFinished?(agentId: AgentId, response: AgentResponse): void;
  onJudgeReady?(judgement: Judgement): void;
  onTurnFinished?(turn: TurnState, responses: Record<AgentId, AgentResponse>): void;
}
