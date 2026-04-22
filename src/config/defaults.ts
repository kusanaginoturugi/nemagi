import type { AppConfig } from "../types/runtime";

export const defaultConfig: AppConfig = {
  runtime: {
    sessionPrefix: "nemagi",
    maxTurnWaitMs: 180000,
    workspaceDir: process.cwd(),
  },
  agents: {
    codex: {
      mode: "process_exit",
      maxWaitMs: 180000,
      cliPath: "/usr/bin/codex",
    },
    claude: {
      mode: "process_exit",
      maxWaitMs: 120000,
      cliPath: "/home/onoue/.local/bin/claude",
    },
    gemini: {
      mode: "process_exit",
      maxWaitMs: 120000,
      cliPath: "/usr/bin/gemini",
    },
  },
  judge: {
    provider: "ollama",
    enabled: true,
    baseUrl: "http://127.0.0.1:11434",
    model: "gemma3:latest",
    timeoutMs: 30000,
  },
};
