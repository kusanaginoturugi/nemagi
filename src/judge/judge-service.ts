import type { AgentId } from "../types/agent";
import type { AgentResponse, Judgement } from "../types/session";
import type { JudgeConfig } from "../types/runtime";
import { OllamaJudgeClient } from "./ollama-judge-client";

export class JudgeService {
  private readonly ollamaClient: OllamaJudgeClient;

  constructor(private readonly config: JudgeConfig) {
    this.ollamaClient = new OllamaJudgeClient(config);
  }

  async evaluate(
    prompt: string,
    responses: Record<AgentId, AgentResponse>,
  ): Promise<Judgement> {
    if (this.config.enabled) {
      try {
        return await this.ollamaClient.evaluate(prompt, responses);
      } catch {
        return this.evaluateHeuristically(prompt, responses);
      }
    }

    return this.evaluateHeuristically(prompt, responses);
  }

  private evaluateHeuristically(
    prompt: string,
    responses: Record<AgentId, AgentResponse>,
  ): Judgement {
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
      summary: `質問: ${prompt}\n完了したエージェント: ${completed.join(", ") || "なし"}`,
      comparison: ids
        .map((id) => `${id}: ${responses[id].status}, ${responses[id].output.length} 文字`)
        .join("\n"),
      recommendedAgent,
      scores: scored,
      supportingAgents: recommendedAgent ? [recommendedAgent] : [],
      dissentingAgents: ids.filter((id) => id !== recommendedAgent && responses[id].output.length > 0),
      consensusStrength: completed.length >= 2 ? "mixed" : "weak",
      majorityApplicable: false,
      needsHumanReview: true,
      judgeReason: "ローカル LLM judge が利用できなかったため、暫定の heuristic fallback を使いました。",
      provider: "heuristic",
    };
  }
}
