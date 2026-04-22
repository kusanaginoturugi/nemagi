export type CompletionMode = "process_exit" | "idle_pattern";

export interface CompletionPolicy {
  mode: CompletionMode;
  idlePattern?: string;
  silenceTimeoutMs?: number;
  maxWaitMs: number;
}

export interface AgentRuntimeConfig {
  mode: CompletionMode;
  maxWaitMs: number;
  silenceTimeoutMs?: number;
  idlePattern?: string;
  cliPath?: string;
}

export interface AgentConfigMap {
  codex: AgentRuntimeConfig;
  claude: AgentRuntimeConfig;
  gemini: AgentRuntimeConfig;
}

export interface AgentDefinition {
  id: AgentId;
  displayName: string;
  command: string;
}

export type AgentId = "codex" | "claude" | "gemini";
