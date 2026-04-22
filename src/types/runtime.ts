import type { AgentConfigMap } from "./agent";

export interface RuntimeConfig {
  sessionPrefix: string;
  maxTurnWaitMs: number;
  workspaceDir: string;
}

export interface JudgeConfig {
  provider: "ollama";
  enabled: boolean;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export interface AppConfig {
  runtime: RuntimeConfig;
  agents: AgentConfigMap;
  judge: JudgeConfig;
}
