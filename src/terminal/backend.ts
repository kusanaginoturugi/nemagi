import type { CaptureResult, CreateSessionResult, TerminalRef } from "../types/terminal";

export interface TerminalBackend {
  createSession(sessionName: string, firstPaneTitle: string): Promise<CreateSessionResult>;
  createPane(sessionName: string, title: string): Promise<TerminalRef>;
  setPaneTitle(ref: TerminalRef, title: string): Promise<void>;
  sendShellCommand(ref: TerminalRef, command: string): Promise<void>;
  capture(ref: TerminalRef): Promise<CaptureResult>;
}
