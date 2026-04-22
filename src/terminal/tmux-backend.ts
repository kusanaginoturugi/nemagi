import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CaptureResult, CreateSessionResult, TerminalRef } from "../types/terminal";
import type { TerminalBackend } from "./backend";

const execFileAsync = promisify(execFile);

export class TmuxBackend implements TerminalBackend {
  async createSession(sessionName: string, firstPaneTitle: string): Promise<CreateSessionResult> {
    const { stdout } = await this.tmux([
      "new-session",
      "-d",
      "-P",
      "-F",
      "#{pane_id}",
      "-s",
      sessionName,
      "-n",
      "nemagi",
    ]);

    const paneId = stdout.trim();
    const rootPane: TerminalRef = {
      sessionName,
      paneId,
      title: firstPaneTitle,
    };

    await this.setPaneTitle(rootPane, firstPaneTitle);
    await this.tmux(["set-option", "-t", sessionName, "history-limit", "5000"]);

    return {
      sessionName,
      rootPane,
    };
  }

  async createPane(sessionName: string, title: string): Promise<TerminalRef> {
    const { stdout } = await this.tmux([
      "split-window",
      "-d",
      "-P",
      "-F",
      "#{pane_id}",
      "-t",
      `${sessionName}:nemagi`,
    ]);

    const pane: TerminalRef = {
      sessionName,
      paneId: stdout.trim(),
      title,
    };

    await this.setPaneTitle(pane, title);
    await this.tmux(["select-layout", "-t", `${sessionName}:nemagi`, "tiled"]);
    return pane;
  }

  async setPaneTitle(ref: TerminalRef, title: string): Promise<void> {
    await this.tmux(["select-pane", "-t", ref.paneId, "-T", title]);
  }

  async sendShellCommand(ref: TerminalRef, command: string): Promise<void> {
    await this.tmux(["send-keys", "-t", ref.paneId, command, "C-m"]);
  }

  async capture(ref: TerminalRef): Promise<CaptureResult> {
    const { stdout } = await this.tmux(["capture-pane", "-p", "-S", "-32768", "-t", ref.paneId]);
    return { text: stdout };
  }

  private async tmux(args: string[]): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync("tmux", args, { encoding: "utf8" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`tmux command failed: tmux ${args.join(" ")}\n${detail}`);
    }
  }
}
