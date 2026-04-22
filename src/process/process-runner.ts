import { spawn } from "node:child_process";
import type { AgentId, CompletionPolicy } from "../types/agent";
import type { AgentResponse, ResponseChunk } from "../types/session";
import type { RunObserver } from "../types/ui";
import { stripAnsi } from "../utils/ansi";

export interface ProcessRunRequest {
  agentId: AgentId;
  displayName: string;
  shellCommand: string;
  completionPolicy: CompletionPolicy;
}

export class ProcessRunner {
  constructor(private readonly workspaceDir: string) {}

  run(
    request: ProcessRunRequest,
    observer?: RunObserver,
  ): Promise<AgentResponse> {
    return new Promise((resolve) => {
      observer?.onAgentStarted?.(request.agentId, request.displayName);

      const child = spawn("sh", ["-lc", request.shellCommand], {
        cwd: this.workspaceDir,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      const chunks: ResponseChunk[] = [];
      let settled = false;
      let timedOut = false;

      const appendChunk = (chunk: string): void => {
        const cleaned = stripAnsi(chunk);
        if (cleaned.length === 0) {
          return;
        }

        output += cleaned;
        chunks.push({
          seq: chunks.length,
          ts: new Date().toISOString(),
          chunk: cleaned,
        });
        observer?.onAgentChunk?.(request.agentId, cleaned);
      };

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", appendChunk);
      child.stderr.on("data", appendChunk);

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, request.completionPolicy.maxWaitMs);

      const finish = (exitCode: number | null): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);

        const status =
          timedOut ? "timed_out" : exitCode === 0 ? "completed" : "failed";

        const response: AgentResponse = {
          agentId: request.agentId,
          status,
          output: output.trim(),
          chunks,
          exitCode: exitCode ?? undefined,
          error: timedOut ? "agent maxWaitMs exceeded" : undefined,
        };

        observer?.onAgentFinished?.(request.agentId, response);
        resolve(response);
      };

      child.on("close", finish);
      child.on("error", (error) => {
        appendChunk(`${error.message}\n`);
        finish(1);
      });
    });
  }
}
