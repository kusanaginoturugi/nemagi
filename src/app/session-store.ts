import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentId } from "../types/agent";
import type { AgentResponse, Judgement, SessionState, TurnState } from "../types/session";

export class SessionStore {
  constructor(private readonly rootDir: string) {}

  async saveSession(session: SessionState): Promise<void> {
    const dir = join(this.rootDir, session.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "session.json"), JSON.stringify(session, null, 2), "utf8");
  }

  async saveTurn(
    sessionId: string,
    turn: TurnState,
    responses: Record<AgentId, AgentResponse>,
    judgement: Judgement,
  ): Promise<void> {
    const turnDir = join(this.rootDir, sessionId, "turns", turn.id);
    await mkdir(turnDir, { recursive: true });
    await writeFile(join(turnDir, "turn.json"), JSON.stringify(turn, null, 2), "utf8");
    await writeFile(join(turnDir, "judge.json"), JSON.stringify(judgement, null, 2), "utf8");

    for (const [agentId, response] of Object.entries(responses) as Array<[AgentId, AgentResponse]>) {
      const jsonl = response.chunks
        .map((chunk) => JSON.stringify(chunk))
        .join("\n");
      await writeFile(join(turnDir, `${agentId}.jsonl`), jsonl, "utf8");
      await writeFile(join(turnDir, `${agentId}.txt`), response.output, "utf8");
      if (response.diagnostics) {
        await writeFile(join(turnDir, `${agentId}.stderr.txt`), response.diagnostics, "utf8");
      }
    }
  }
}
