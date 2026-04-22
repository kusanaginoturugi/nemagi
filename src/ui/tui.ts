import blessed from "blessed";
import type { AgentId } from "../types/agent";
import type { AgentResponse, Judgement, TurnState } from "../types/session";
import type { RunObserver } from "../types/ui";

type PaneId = AgentId | "judge" | "prompt";

interface PaneRefs {
  prompt: blessed.Widgets.BoxElement;
  codex: blessed.Widgets.Log;
  claude: blessed.Widgets.Log;
  gemini: blessed.Widgets.Log;
  judge: blessed.Widgets.Log;
  footer: blessed.Widgets.BoxElement;
  help: blessed.Widgets.BoxElement;
}

type PaneStatus = "input" | "waiting" | "thinking..." | "finish" | "failed" | "timed_out" | "ready";

export class NemagiTui implements RunObserver {
  private readonly screen: blessed.Widgets.Screen;
  private readonly panes: PaneRefs;
  private readonly focusOrder: PaneId[] = ["prompt", "codex", "claude", "gemini", "judge"];
  private readonly paneTitles: Record<PaneId, string> = {
    prompt: "Prompt",
    codex: "Codex",
    claude: "Claude",
    gemini: "Gemini",
    judge: "Judge",
  };
  private readonly paneStatuses: Record<PaneId, PaneStatus> = {
    prompt: "input",
    codex: "waiting",
    claude: "waiting",
    gemini: "waiting",
    judge: "waiting",
  };
  private focusIndex = 1;
  private maximizedPane?: PaneId;
  private helpVisible = false;

  constructor(private readonly initialPrompt?: string) {
    this.screen = blessed.screen({
      smartCSR: true,
      title: "nemagi",
      fullUnicode: true,
    });

    this.panes = this.buildLayout();
    this.bindKeys();
    this.setPrompt(initialPrompt ?? "Prompt will appear here");
    this.focusPane("codex");
    this.updatePaneLabels();
    this.refreshFooter();
    this.screen.render();
  }

  async askPrompt(): Promise<string> {
    if (this.initialPrompt && this.initialPrompt.trim().length > 0) {
      this.setPrompt(this.initialPrompt);
      return this.initialPrompt;
    }

    return new Promise((resolve, reject) => {
      const prompt = blessed.prompt({
        parent: this.screen,
        border: "line",
        height: 10,
        width: "80%",
        top: "center",
        left: "center",
        label: " Prompt ",
        tags: true,
      });

      prompt.input("質問を入力してください", "", (error, value) => {
        prompt.destroy();
        this.screen.render();
        if (error || !value || value.trim().length === 0) {
          reject(new Error("Prompt is required"));
          return;
        }

        this.setPrompt(value);
        resolve(value);
      });
    });
  }

  destroy(): void {
    this.screen.destroy();
  }

  onTurnStarted(turn: TurnState): void {
    this.clearLogs();
    this.paneStatuses.codex = "waiting";
    this.paneStatuses.claude = "waiting";
    this.paneStatuses.gemini = "waiting";
    this.paneStatuses.judge = "waiting";
    this.updatePaneLabels();
    this.setFooterPrefix(`turn ${turn.id}`);
    this.refreshFooter();
    this.screen.render();
  }

  onAgentStarted(agentId: AgentId, displayName: string): void {
    this.paneStatuses[agentId] = "thinking...";
    this.updatePaneLabels();
    this.log(agentId, `[started] ${displayName}`);
  }

  onAgentChunk(agentId: AgentId, chunk: string): void {
    this.log(agentId, chunk);
  }

  onAgentFinished(agentId: AgentId, response: AgentResponse): void {
    this.paneStatuses[agentId] =
      response.status === "completed"
        ? "finish"
        : response.status === "timed_out"
          ? "timed_out"
          : "failed";
    this.updatePaneLabels();
    this.log(agentId, `\n[finished] status=${response.status} exit=${response.exitCode ?? "?"}`);
  }

  onJudgeReady(judgement: Judgement): void {
    this.paneStatuses.judge = "ready";
    this.updatePaneLabels();
    this.log(
      "judge",
      [
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
      ].join("\n"),
    );
  }

  onTurnFinished(turn: TurnState, responses: Record<AgentId, AgentResponse>): void {
    const summary = Object.entries(responses)
      .map(([id, response]) => `${id}:${response.status}`)
      .join(" ");
    this.setFooterPrefix(`turn ${turn.status} | ${summary}`);
    this.refreshFooter();
    this.screen.render();
  }

  private buildLayout(): PaneRefs {
    const prompt = blessed.box({
      parent: this.screen,
      label: " Prompt ",
      border: "line",
      top: 0,
      left: 0,
      width: "100%",
      height: 5,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      mouse: true,
      scrollbar: {
        ch: " ",
      },
      style: {
        border: { fg: "cyan" },
      },
    });

    const logBase: Partial<blessed.Widgets.LogOptions> = {
      parent: this.screen,
      border: "line",
      keys: true,
      mouse: true,
      scrollable: true,
      alwaysScroll: true,
      tags: false,
      vi: true,
      scrollbar: {
        ch: " ",
      },
      style: {
        border: { fg: "gray" },
      },
    };

    const codex = blessed.log({
      ...logBase,
      label: " Codex ",
      top: 5,
      left: 0,
      width: "50%",
      height: "40%-1",
    });

    const claude = blessed.log({
      ...logBase,
      label: " Claude ",
      top: 5,
      left: "50%",
      width: "50%",
      height: "40%-1",
    });

    const gemini = blessed.log({
      ...logBase,
      label: " Gemini ",
      top: "40%+4",
      left: 0,
      width: "50%",
      bottom: 1,
    });

    const judge = blessed.log({
      ...logBase,
      label: " Judge ",
      top: "40%+4",
      left: "50%",
      width: "50%",
      bottom: 1,
    });

    const footer = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: "100%",
      height: 1,
      tags: true,
      style: {
        fg: "black",
        bg: "white",
      },
      content: "",
    });

    const help = blessed.box({
      parent: this.screen,
      label: " Help ",
      border: "line",
      top: "center",
      left: "center",
      width: "70%",
      height: 15,
      tags: true,
      hidden: true,
      scrollable: true,
      keys: true,
      mouse: true,
      padding: {
        left: 1,
        right: 1,
      },
      style: {
        border: { fg: "yellow" },
        bg: "black",
        fg: "white",
      },
      content: [
        "閲覧キー",
        "",
        "h / l, ← / → : ペイン移動",
        "j / k, ↑ / ↓ : 1行スクロール",
        "Ctrl-d / Ctrl-u : 半ページスクロール",
        "g / G : 先頭 / 末尾へ移動",
        "z : 現在ペインを拡大 / 戻す",
        "1 / 2 / 3 / 4 : Codex / Claude / Gemini / Judge に移動",
        "Tab / Shift-Tab : 次 / 前のペイン",
        "? : このヘルプを表示 / 非表示",
        "Esc : ヘルプを閉じる",
        "q : 終了",
      ].join("\n"),
    });

    return { prompt, codex, claude, gemini, judge, footer, help };
  }

  private bindKeys(): void {
    this.screen.key(["q", "C-c"], () => {
      if (this.helpVisible) {
        this.toggleHelp(false);
        return;
      }
      this.destroy();
      process.exit(0);
    });

    this.screen.key(["?"], () => {
      this.toggleHelp(!this.helpVisible);
    });

    this.screen.key(["escape"], () => {
      if (this.helpVisible) {
        this.toggleHelp(false);
      }
    });

    this.screen.key(["tab"], () => {
      if (this.helpVisible) {
        return;
      }
      this.focusIndex = (this.focusIndex + 1) % this.focusOrder.length;
      this.focusPane(this.focusOrder[this.focusIndex]);
    });

    this.screen.key(["S-tab"], () => {
      if (this.helpVisible) {
        return;
      }
      this.focusIndex = (this.focusIndex - 1 + this.focusOrder.length) % this.focusOrder.length;
      this.focusPane(this.focusOrder[this.focusIndex]);
    });

    this.screen.key(["1"], () => this.focusPane("codex"));
    this.screen.key(["2"], () => this.focusPane("claude"));
    this.screen.key(["3"], () => this.focusPane("gemini"));
    this.screen.key(["4"], () => this.focusPane("judge"));

    this.screen.key(["h", "left"], () => {
      if (this.helpVisible) {
        return;
      }
      this.moveFocus(-1);
    });

    this.screen.key(["l", "right"], () => {
      if (this.helpVisible) {
        return;
      }
      this.moveFocus(1);
    });

    this.screen.key(["j", "down"], () => {
      if (this.helpVisible) {
        return;
      }
      const current = this.currentScrollablePane();
      current?.scroll(1);
      this.screen.render();
    });

    this.screen.key(["k", "up"], () => {
      if (this.helpVisible) {
        return;
      }
      const current = this.currentScrollablePane();
      current?.scroll(-1);
      this.screen.render();
    });

    this.screen.key(["C-d"], () => {
      if (this.helpVisible) {
        return;
      }
      const current = this.currentScrollablePane();
      current?.scroll(this.pageSize(current));
      this.screen.render();
    });

    this.screen.key(["C-u"], () => {
      if (this.helpVisible) {
        return;
      }
      const current = this.currentScrollablePane();
      current?.scroll(-this.pageSize(current));
      this.screen.render();
    });

    this.screen.key(["g"], () => {
      if (this.helpVisible) {
        return;
      }
      const current = this.currentScrollablePane();
      current?.setScroll(0);
      this.screen.render();
    });

    this.screen.key(["G"], () => {
      if (this.helpVisible) {
        return;
      }
      const current = this.currentScrollablePane();
      current?.setScroll(current.getScrollHeight());
      this.screen.render();
    });

    this.screen.key(["z"], () => {
      if (this.helpVisible) {
        return;
      }
      const paneId = this.focusOrder[this.focusIndex];
      this.toggleZoom(paneId);
    });

    this.screen.key(["pageup"], () => {
      if (this.helpVisible) {
        return;
      }
      const current = this.currentScrollablePane();
      current?.scroll(-this.pageSize(current));
      this.screen.render();
    });

    this.screen.key(["pagedown"], () => {
      if (this.helpVisible) {
        return;
      }
      const current = this.currentScrollablePane();
      current?.scroll(this.pageSize(current));
      this.screen.render();
    });
  }

  private currentScrollablePane():
    | blessed.Widgets.Log
    | blessed.Widgets.BoxElement
    | undefined {
    const paneId = this.focusOrder[this.focusIndex];
    return this.panes[paneId];
  }

  private focusPane(paneId: PaneId): void {
    this.focusIndex = this.focusOrder.indexOf(paneId);
    const targets: PaneId[] = ["prompt", "codex", "claude", "gemini", "judge"];
    for (const target of targets) {
      const element = this.panes[target];
      element.style.border = {
        fg: target === paneId ? "green" : target === "prompt" ? "cyan" : "gray",
      };
    }
    this.updatePaneLabels();
    this.panes[paneId].focus();
    this.refreshFooter();
    this.screen.render();
  }

  private moveFocus(delta: number): void {
    const paneOnlyOrder: PaneId[] = ["codex", "claude", "gemini", "judge"];
    const current = this.focusOrder[this.focusIndex];
    const currentPane = paneOnlyOrder.includes(current) ? current : "codex";
    const index = paneOnlyOrder.indexOf(currentPane);
    const nextIndex = (index + delta + paneOnlyOrder.length) % paneOnlyOrder.length;
    this.focusPane(paneOnlyOrder[nextIndex]);
  }

  private pageSize(
    element: blessed.Widgets.Log | blessed.Widgets.BoxElement | undefined,
  ): number {
    const height = element?.height;
    if (typeof height === "number") {
      return Math.max(5, Math.floor(height / 2));
    }
    return 10;
  }

  private toggleZoom(paneId: PaneId): void {
    this.maximizedPane = this.maximizedPane === paneId ? undefined : paneId;
    this.applyLayout();
    this.focusPane(paneId);
  }

  private applyLayout(): void {
    const allPanes: PaneId[] = ["prompt", "codex", "claude", "gemini", "judge"];
    if (!this.maximizedPane) {
      this.panes.prompt.show();
      this.panes.codex.show();
      this.panes.claude.show();
      this.panes.gemini.show();
      this.panes.judge.show();

      this.panes.prompt.top = 0;
      this.panes.prompt.left = 0;
      this.panes.prompt.width = "100%";
      this.panes.prompt.height = 5;

      this.panes.codex.top = 5;
      this.panes.codex.left = 0;
      this.panes.codex.width = "50%";
      this.panes.codex.height = "40%-1";

      this.panes.claude.top = 5;
      this.panes.claude.left = "50%";
      this.panes.claude.width = "50%";
      this.panes.claude.height = "40%-1";

      this.panes.gemini.top = "40%+4";
      this.panes.gemini.left = 0;
      this.panes.gemini.width = "50%";
      this.panes.gemini.bottom = 1;

      this.panes.judge.top = "40%+4";
      this.panes.judge.left = "50%";
      this.panes.judge.width = "50%";
      this.panes.judge.bottom = 1;
      this.screen.render();
      return;
    }

    for (const pane of allPanes) {
      if (pane === this.maximizedPane) {
        this.panes[pane].show();
      } else {
        this.panes[pane].hide();
      }
    }

    const target = this.panes[this.maximizedPane];
    target.top = 0;
    target.left = 0;
    target.width = "100%";
    target.height = "100%-1";
    this.screen.render();
  }

  private toggleHelp(visible: boolean): void {
    this.helpVisible = visible;
    if (visible) {
      this.panes.help.show();
      this.panes.help.focus();
      this.setFooter("help: Esc or ? to close");
    } else {
      this.panes.help.hide();
      this.focusPane(this.focusOrder[this.focusIndex]);
      this.refreshFooter();
    }
    this.screen.render();
  }

  private clearLogs(): void {
    this.panes.codex.setContent("");
    this.panes.claude.setContent("");
    this.panes.gemini.setContent("");
    this.panes.judge.setContent("");
  }

  private setPrompt(prompt: string): void {
    this.panes.prompt.setContent(prompt);
    this.screen.render();
  }

  private footerPrefix = "";

  private setFooterPrefix(content: string): void {
    this.footerPrefix = content;
  }

  private refreshFooter(): void {
    if (this.helpVisible) {
      this.setFooter("help: Esc or ? to close");
      return;
    }

    const focusedPane = this.focusOrder[this.focusIndex];
    const focusLabel = this.paneTitles[focusedPane];
    const prefix = this.footerPrefix ? `${this.footerPrefix} | ` : "";
    this.setFooter(
      `${prefix}focus: ${focusLabel} | h/l pane  j/k scroll  ^u/^d half  g/G top/btm  z zoom  ? help  q quit`,
    );
  }

  private setFooter(content: string): void {
    this.panes.footer.setContent(` ${content}`);
  }

  private log(target: AgentId | "judge", message: string): void {
    const box = this.panes[target];
    const lines = message.split("\n");
    for (const line of lines) {
      box.log(line);
    }
    this.screen.render();
  }

  private updatePaneLabels(): void {
    const focusedPane = this.focusOrder[this.focusIndex];
    const panes: PaneId[] = ["prompt", "codex", "claude", "gemini", "judge"];
    for (const paneId of panes) {
      const prefix = paneId === focusedPane ? "▶ " : "";
      const title = this.paneTitles[paneId];
      const status = this.paneStatuses[paneId];
      this.panes[paneId].setLabel(` ${prefix}${title} [${status}] `);
    }
  }
}
