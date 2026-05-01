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

interface Notice {
  key: string;
  message: string;
}

function classifyNotice(text: string): Notice | undefined {
  const lower = text.toLowerCase();
  if (
    /exhausted your capacity on this model|quota will reset|rate limit|resource_exhausted|429|try again later/.test(
      lower,
    )
  ) {
    return { key: "rate_limit", message: "rate limit / capacity limit" };
  }

  if (/authentication|unauthorized|api key|login|permission denied/.test(lower)) {
    return { key: "auth_error", message: "authentication error" };
  }

  if (
    /unauthorized tool call|tool .* not found|tool call blocked|not available to this agent/.test(lower)
  ) {
    return { key: "tool_error", message: "tool access blocked" };
  }

  if (/command not found|executable file not found|enoent/.test(lower)) {
    return { key: "command_error", message: "command not found" };
  }

  if (/retrying after/.test(lower)) {
    return { key: "retrying", message: "retrying after backoff" };
  }

  return undefined;
}

function summarizeDiagnostics(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (firstLine.length === 0) {
    return "stderr output detected";
  }
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
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
      let diagnostics = "";
      const chunks: ResponseChunk[] = [];
      let settled = false;
      let timedOut = false;
      const emittedNoticeKeys = new Set<string>();

      const emitNotice = (notice: Notice): void => {
        if (emittedNoticeKeys.has(notice.key)) {
          return;
        }
        emittedNoticeKeys.add(notice.key);
        observer?.onAgentNotice?.(request.agentId, notice.message);
      };

      const appendStdout = (chunk: string): void => {
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

      const appendStderr = (chunk: string): void => {
        const cleaned = stripAnsi(chunk);
        if (cleaned.length === 0) {
          return;
        }

        diagnostics += cleaned;
        const notice = classifyNotice(cleaned);
        if (notice) {
          emitNotice(notice);
        }
      };

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", appendStdout);
      child.stderr.on("data", appendStderr);

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

        const trimmedOutput = output.trim();
        const trimmedDiagnostics = diagnostics.trim();
        if (trimmedDiagnostics.length > 0 && emittedNoticeKeys.size === 0) {
          emitNotice({ key: "stderr", message: summarizeDiagnostics(trimmedDiagnostics) });
        }

        const response: AgentResponse = {
          agentId: request.agentId,
          status,
          output: trimmedOutput,
          chunks,
          exitCode: exitCode ?? undefined,
          error: timedOut ? "agent maxWaitMs exceeded" : status === "failed" ? trimmedDiagnostics || undefined : undefined,
          diagnostics: trimmedDiagnostics.length > 0 ? trimmedDiagnostics : undefined,
        };

        observer?.onAgentFinished?.(request.agentId, response);
        resolve(response);
      };

      child.on("close", finish);
      child.on("error", (error) => {
        appendStderr(`${error.message}\n`);
        finish(1);
      });
    });
  }
}
