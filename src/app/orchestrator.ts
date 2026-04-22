import { join } from "node:path";
import type { AgentId } from "../types/agent";
import type { AppConfig } from "../types/runtime";
import type { AgentResponse, SessionState, TurnState } from "../types/session";
import type { TerminalRef } from "../types/terminal";
import type { TerminalBackend } from "../terminal/backend";
import type { AgentAdapter } from "../agents/adapter";
import { OutputCollector, type CollectTarget } from "../collector/output-collector";
import { JudgeService } from "../judge/judge-service";
import { SessionStore } from "./session-store";
import { buildSessionName, buildTurnId } from "../utils/ids";
import { writeTextFile } from "../utils/fs";
import { shellEscape } from "../utils/shell";

interface PaneRegistry {
  status: TerminalRef;
  judge: TerminalRef;
  agents: Record<AgentId, TerminalRef>;
}

export class Orchestrator {
  private session?: SessionState;
  private panes?: PaneRegistry;
  private priorJudgeSummary?: string;
  private readonly collector: OutputCollector;
  private readonly judge = new JudgeService();
  private readonly store: SessionStore;

  constructor(
    private readonly config: AppConfig,
    private readonly backend: TerminalBackend,
    private readonly adapters: AgentAdapter[],
  ) {
    this.collector = new OutputCollector(backend);
    this.store = new SessionStore(join(config.runtime.workspaceDir, "sessions"));
  }

  async bootstrap(): Promise<SessionState> {
    if (this.session && this.panes) {
      return this.session;
    }

    const sessionName = buildSessionName(this.config.runtime.sessionPrefix);
    const created = await this.backend.createSession(sessionName, this.config.runtime.statusPaneName);
    const judgePane = await this.backend.createPane(sessionName, this.config.runtime.judgePaneName);
    const agentPanes: Record<AgentId, TerminalRef> = {} as Record<AgentId, TerminalRef>;

    for (const adapter of this.adapters) {
      agentPanes[adapter.id] = await this.backend.createPane(sessionName, adapter.displayName);
    }

    this.panes = {
      status: created.rootPane,
      judge: judgePane,
      agents: agentPanes,
    };

    this.session = {
      id: sessionName,
      createdAt: new Date().toISOString(),
      tmuxSessionName: sessionName,
      panes: {
        status: created.rootPane.paneId,
        judge: judgePane.paneId,
        codex: agentPanes.codex.paneId,
        claude: agentPanes.claude.paneId,
        gemini: agentPanes.gemini.paneId,
      },
    };

    await this.backend.sendShellCommand(created.rootPane, `printf %s ${shellEscape(`nemagi session ${sessionName} ready\n`)}`);
    await this.store.saveSession(this.session);
    return this.session;
  }

  async runTurn(prompt: string): Promise<{
    turn: TurnState;
    responses: Record<AgentId, AgentResponse>;
  }> {
    if (!this.session || !this.panes) {
      await this.bootstrap();
    }

    const turn: TurnState = {
      id: buildTurnId(),
      prompt,
      startedAt: new Date().toISOString(),
      status: "running",
    };

    const plans = this.adapters.map((adapter) =>
      adapter.buildExecutionPlan({
        prompt,
        priorJudgeSummary: this.priorJudgeSummary,
      }),
    );

    const targets: CollectTarget[] = [];
    for (const plan of plans) {
      const pane = this.panes!.agents[plan.agentId];
      const startMarker = `__NEMAGI_TURN_START_${turn.id}_${plan.agentId}__`;
      const endMarker = `__NEMAGI_TURN_END_${turn.id}_${plan.agentId}__`;
      const wrapped = this.wrapTurnCommand(plan.shellCommand, startMarker, endMarker);
      await this.backend.sendShellCommand(pane, wrapped);
      targets.push({
        agentId: plan.agentId,
        pane,
        startMarker,
        endMarker,
      });
    }

    let responses = await this.collector.poll(targets);
    const deadline = Date.now() + this.config.runtime.maxTurnWaitMs;
    while (Date.now() < deadline) {
      const allDone = Object.values(responses).every((response) => response.status !== "running");
      if (allDone) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, this.config.runtime.pollIntervalMs));
      responses = await this.collector.poll(targets);
    }

    const deadlineReached = Object.values(responses).some((response) => response.status === "running");
    if (deadlineReached) {
      responses = this.markTimedOut(responses);
      turn.status = "timed_out";
    } else {
      turn.status = "completed";
    }
    turn.completedAt = new Date().toISOString();

    const judgement = await this.judge.evaluate(prompt, responses);
    this.priorJudgeSummary = judgement.summary;
    await this.store.saveTurn(this.session!.id, turn, responses, judgement);
    await writeTextFile(
      join(this.config.runtime.workspaceDir, "sessions", this.session!.id, "latest-judge.txt"),
      `${judgement.summary}\n\n${judgement.comparison}\n`,
    );
    await this.backend.sendShellCommand(
      this.panes!.judge,
      `printf %s ${shellEscape(`${turn.id}\n${judgement.summary}\n\n${judgement.comparison}\n`)}`,
    );

    return { turn, responses };
  }

  private wrapTurnCommand(agentCommand: string, startMarker: string, endMarker: string): string {
    const script = [
      `printf '%s\\n' ${shellEscape(startMarker)}`,
      agentCommand,
      "status=$?",
      `printf '%s:%s\\n' ${shellEscape(endMarker)} "$status"`,
    ].join("; ");

    return `sh -lc ${shellEscape(script)}`;
  }

  private markTimedOut(
    responses: Record<AgentId, AgentResponse>,
  ): Record<AgentId, AgentResponse> {
    return Object.fromEntries(
      Object.entries(responses).map(([agentId, response]) => {
        if (response.status !== "running") {
          return [agentId, response];
        }

        return [
          agentId,
          {
            ...response,
            status: "timed_out",
            error: "max_turn_wait_ms exceeded",
          },
        ];
      }),
    ) as Record<AgentId, AgentResponse>;
  }
}
