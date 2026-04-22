export interface TerminalRef {
  sessionName: string;
  paneId: string;
  title: string;
}

export interface CaptureResult {
  text: string;
}

export interface CreateSessionResult {
  sessionName: string;
  rootPane: TerminalRef;
}
