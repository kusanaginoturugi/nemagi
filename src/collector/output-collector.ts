import type { AgentId } from "../types/agent";
import type { AgentResponse, ResponseChunk } from "../types/session";
import type { TerminalBackend } from "../terminal/backend";
import type { TerminalRef } from "../types/terminal";
import { stripAnsi } from "../utils/ansi";

export interface CollectTarget {
  agentId: AgentId;
  pane: TerminalRef;
  startMarker: string;
  endMarker: string;
}

interface CollectorState {
  extracted: string;
  chunks: ResponseChunk[];
  done: boolean;
  exitCode?: number;
}

export class OutputCollector {
  private readonly state = new Map<AgentId, CollectorState>();

  constructor(private readonly backend: TerminalBackend) {}

  async poll(targets: CollectTarget[]): Promise<Record<AgentId, AgentResponse>> {
    const entries = await Promise.all(
      targets.map(async (target) => [target.agentId, await this.collectOne(target)] as const),
    );
    return Object.fromEntries(entries) as Record<AgentId, AgentResponse>;
  }

  private async collectOne(target: CollectTarget): Promise<AgentResponse> {
    const capture = await this.backend.capture(target.pane);
    const cleaned = stripAnsi(capture.text);
    const previous = this.state.get(target.agentId) ?? { extracted: "", chunks: [], done: false };
    const extracted = this.extractBetweenMarkers(cleaned, target.startMarker, target.endMarker);
    const body = extracted.body;
    const nextChunks = previous.chunks.slice();

    if (body.length > previous.extracted.length && body.startsWith(previous.extracted)) {
      nextChunks.push({
        seq: nextChunks.length,
        ts: new Date().toISOString(),
        chunk: body.slice(previous.extracted.length),
      });
    } else if (body !== previous.extracted) {
      nextChunks.push({
        seq: nextChunks.length,
        ts: new Date().toISOString(),
        chunk: body,
      });
    }

    const state: CollectorState = {
      extracted: body,
      chunks: nextChunks,
      done: extracted.done,
      exitCode: extracted.exitCode,
    };
    this.state.set(target.agentId, state);

    return {
      agentId: target.agentId,
      status: extracted.done ? "completed" : "running",
      output: body.trim(),
      chunks: nextChunks,
      exitCode: extracted.exitCode,
    };
  }

  private extractBetweenMarkers(
    input: string,
    startMarker: string,
    endMarker: string,
  ): { body: string; done: boolean; exitCode?: number } {
    const startIndex = input.indexOf(startMarker);
    if (startIndex === -1) {
      return { body: "", done: false };
    }

    const bodyStart = startIndex + startMarker.length;
    const endIndex = input.indexOf(endMarker, bodyStart);
    if (endIndex === -1) {
      return { body: input.slice(bodyStart), done: false };
    }

    const body = input.slice(bodyStart, endIndex);
    const lineTail = input.slice(endIndex + endMarker.length).split("\n", 1)[0] ?? "";
    const exitCodeMatch = lineTail.match(/:(\d+)/);
    return {
      body,
      done: true,
      exitCode: exitCodeMatch ? Number(exitCodeMatch[1]) : undefined,
    };
  }
}
