import { join } from "node:path";
import type { AgentId } from "../types/agent";
import type { AppConfig } from "../types/runtime";
import type { AgentResponse, SessionState, TurnState } from "../types/session";
import type { AgentAdapter } from "../agents/adapter";
import { JudgeService } from "../judge/judge-service";
import { SessionStore } from "./session-store";
import { buildSessionName, buildTurnId } from "../utils/ids";
import { writeTextFile } from "../utils/fs";
import { ProcessRunner } from "../process/process-runner";
import type { RunObserver } from "../types/ui";

export class Orchestrator {
  private session?: SessionState;
  private priorJudgeSummary?: string;
  private readonly judge: JudgeService;
  private readonly store: SessionStore;
  private readonly runner: ProcessRunner;

  constructor(
    private readonly config: AppConfig,
    private readonly adapters: AgentAdapter[],
  ) {
    this.judge = new JudgeService(config.judge);
    this.store = new SessionStore(join(config.runtime.workspaceDir, "sessions"));
    this.runner = new ProcessRunner(config.runtime.workspaceDir);
  }

  async bootstrap(): Promise<SessionState> {
    if (this.session) {
      return this.session;
    }

    const sessionName = buildSessionName(this.config.runtime.sessionPrefix);

    this.session = {
      id: sessionName,
      createdAt: new Date().toISOString(),
      mode: "process-tui",
      agents: this.adapters.map((adapter) => adapter.id),
    };

    await this.store.saveSession(this.session);
    return this.session;
  }

  async runTurn(
    prompt: string,
    observer?: RunObserver,
  ): Promise<{
    turn: TurnState;
    responses: Record<AgentId, AgentResponse>;
  }> {
    if (!this.session) {
      await this.bootstrap();
    }

    const turn: TurnState = {
      id: buildTurnId(),
      prompt,
      startedAt: new Date().toISOString(),
      status: "running",
    };
    observer?.onTurnStarted?.(turn);

    const plans = this.adapters.map((adapter) =>
      adapter.buildExecutionPlan({
        prompt,
        priorJudgeSummary: this.priorJudgeSummary,
      }),
    );

    const results = await Promise.all(
      plans.map((plan) =>
        this.runner.run(
          {
            agentId: plan.agentId,
            displayName: plan.displayName,
            shellCommand: plan.shellCommand,
            completionPolicy: {
              ...plan.completionPolicy,
              maxWaitMs: Math.min(
                plan.completionPolicy.maxWaitMs,
                this.config.runtime.maxTurnWaitMs,
              ),
            },
          },
          observer,
        ),
      ),
    );

    const responses = Object.fromEntries(
      results.map((response) => [response.agentId, response]),
    ) as Record<AgentId, AgentResponse>;

    turn.status = this.deriveTurnStatus(responses);
    turn.completedAt = new Date().toISOString();

    const judgement = await this.judge.evaluate(prompt, responses);
    this.priorJudgeSummary = judgement.summary;
    await this.store.saveTurn(this.session!.id, turn, responses, judgement);
    const judgementText = [
      judgement.summary,
      "",
      `judge provider: ${judgement.provider}`,
      `多数決を使う問いか: ${judgement.majorityApplicable}`,
      `合意の強さ: ${judgement.consensusStrength}`,
      `人手確認が必要か: ${judgement.needsHumanReview}`,
      `支持したエージェント: ${judgement.supportingAgents.join(", ") || "なし"}`,
      `異論のあるエージェント: ${judgement.dissentingAgents.join(", ") || "なし"}`,
      `合意された答え: ${judgement.consensusAnswer ?? "なし"}`,
      `judge の理由: ${judgement.judgeReason}`,
      "",
      judgement.comparison,
    ].join("\n");
    await writeTextFile(
      join(this.config.runtime.workspaceDir, "sessions", this.session!.id, "latest-judge.txt"),
      `${judgementText}\n`,
    );
    observer?.onJudgeReady?.(judgement);
    observer?.onTurnFinished?.(turn, responses);

    return { turn, responses };
  }

  private deriveTurnStatus(
    responses: Record<AgentId, AgentResponse>,
  ): TurnState["status"] {
    const statuses = Object.values(responses).map((response) => response.status);
    if (statuses.includes("timed_out")) {
      return "timed_out";
    }
    if (statuses.includes("failed")) {
      return "failed";
    }
    return "completed";
  }
}
