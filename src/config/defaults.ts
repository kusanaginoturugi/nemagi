import type { AppConfig } from "../types/runtime";

export const defaultConfig: AppConfig = {
  runtime: {
    sessionPrefix: "nemagi",
    paneHistoryLimit: 5000,
    pollIntervalMs: 500,
    maxTurnWaitMs: 180000,
    workspaceDir: process.cwd(),
    statusPaneName: "status",
    judgePaneName: "judge",
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
};
