import type { AgentId } from "../types/agent";
import type { AgentResponse, Judgement } from "../types/session";

export class JudgeService {
  async evaluate(
    prompt: string,
    responses: Record<AgentId, AgentResponse>,
  ): Promise<Judgement> {
    const ids = Object.keys(responses) as AgentId[];
    const completed = ids.filter((id) => responses[id].status === "completed");
    const scored = ids.reduce<Record<AgentId, number>>(
      (acc, id) => {
        const output = responses[id].output.trim();
        acc[id] = output.length === 0 ? 0 : Math.min(5, Math.max(1, Math.ceil(output.length / 400)));
        return acc;
      },
      { codex: 0, claude: 0, gemini: 0 },
    );

    const recommendedAgent = completed.sort((left, right) => scored[right] - scored[left])[0];

    return {
      summary: `Prompt: ${prompt}\nCompleted agents: ${completed.join(", ") || "none"}`,
      comparison: ids
        .map((id) => `${id}: ${responses[id].status}, ${responses[id].output.length} chars`)
        .join("\n"),
      recommendedAgent,
      scores: scored,
    };
  }
}
