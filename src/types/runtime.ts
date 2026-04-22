import type { AgentConfigMap } from "./agent";

export interface RuntimeConfig {
  sessionPrefix: string;
  paneHistoryLimit: number;
  pollIntervalMs: number;
  maxTurnWaitMs: number;
  workspaceDir: string;
  statusPaneName: string;
  judgePaneName: string;
}

export interface AppConfig {
  runtime: RuntimeConfig;
  agents: AgentConfigMap;
}
