import type { AgentId } from "../types/agent";
import type { AgentResponse, Judgement } from "../types/session";
import type { JudgeConfig } from "../types/runtime";

interface OllamaGenerateResponse {
  response?: string;
}

interface OllamaJudgePayload {
  summary?: string;
  comparison?: string;
  consensus_answer?: string | null;
  supporting_agents?: string[];
  dissenting_agents?: string[];
  consensus_strength?: "strong" | "mixed" | "weak";
  majority_applicable?: boolean;
  needs_human_review?: boolean;
  judge_reason?: string;
  recommended_agent?: string | null;
  scores?: Partial<Record<AgentId, number>>;
}

const AGENT_IDS: AgentId[] = ["codex", "claude", "gemini"];
type PromptKind = "objective" | "subjective" | "uncertain";

export class OllamaJudgeClient {
  constructor(private readonly config: JudgeConfig) {}

  async evaluate(
    prompt: string,
    responses: Record<AgentId, AgentResponse>,
  ): Promise<Judgement> {
    const promptKind = this.classifyPrompt(prompt);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          prompt: this.buildPrompt(prompt, responses, promptKind),
          stream: false,
          format: "json",
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`ollama returned ${response.status}`);
      }

      const payload = (await response.json()) as OllamaGenerateResponse;
      const parsed = this.parsePayload(payload.response ?? "");
      const normalized = this.normalize(parsed, responses, promptKind);
      return await this.ensureJapanese(normalized);
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildPrompt(
    prompt: string,
    responses: Record<AgentId, AgentResponse>,
    promptKind: PromptKind,
  ): string {
    const responseBlocks = AGENT_IDS.map((agentId) => {
      const response = responses[agentId];
      return [
        `## ${agentId}`,
        `status: ${response.status}`,
        `exit_code: ${response.exitCode ?? "null"}`,
        "response:",
        response.output || "(empty)",
      ].join("\n");
    }).join("\n\n");

    return [
      "You are a consensus judge comparing three model answers.",
      "All natural-language output fields must be written in Japanese.",
      "Decide whether majority voting is applicable for this prompt.",
      "If the prompt is open-ended, subjective, or primarily opinion-based, set majority_applicable=false and do not force a consensus.",
      "If the prompt has a concrete answer, identify the shared conclusion, supporting agents, dissenting agents, and whether human review is still needed.",
      "Return valid JSON only, no markdown.",
      "Use this schema:",
      '{"summary":"string","comparison":"string","consensus_answer":"string|null","supporting_agents":["codex","claude"],"dissenting_agents":["gemini"],"consensus_strength":"strong|mixed|weak","majority_applicable":true,"needs_human_review":false,"judge_reason":"string","recommended_agent":"codex|claude|gemini|null","scores":{"codex":1,"claude":1,"gemini":1}}',
      "",
      `Prompt kind hint: ${promptKind}`,
      "Treat subjective prompts conservatively: prefer majority_applicable=false unless the prompt clearly asks for a verifiable fact or exact solution.",
      "Write summary, comparison, consensus_answer, and judge_reason in natural Japanese.",
      "",
      `Prompt:\n${prompt}`,
      "",
      "Responses:",
      responseBlocks,
      "",
      "Scoring guidance:",
      "- 5: best answer or strongest consensus-aligned answer",
      "- 3: acceptable but incomplete or minority answer with some value",
      "- 1: weak, failed, or mostly unusable answer",
    ].join("\n");
  }

  private parsePayload(text: string): OllamaJudgePayload {
    const trimmed = text.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) {
      throw new Error("judge returned non-json response");
    }

    return JSON.parse(trimmed.slice(start, end + 1)) as OllamaJudgePayload;
  }

  private normalize(
    payload: OllamaJudgePayload,
    responses: Record<AgentId, AgentResponse>,
    promptKind: PromptKind,
  ): Judgement {
    const supportingAgents = this.normalizeAgents(payload.supporting_agents);
    const dissentingAgents = this.normalizeAgents(payload.dissenting_agents).filter(
      (agentId) => !supportingAgents.includes(agentId),
    );
    const recommendedAgent = this.normalizeAgent(payload.recommended_agent);
    const scores = this.normalizeScores(payload.scores, responses, supportingAgents, dissentingAgents);
    const majorityApplicable =
      promptKind === "subjective" ? false : (payload.majority_applicable ?? false);
    const needsHumanReview =
      promptKind === "subjective" ? true : (payload.needs_human_review ?? true);
    const consensusStrength =
      promptKind === "subjective" && payload.consensus_strength === "strong"
        ? "mixed"
        : (payload.consensus_strength ?? "weak");

    return {
      summary: payload.summary?.trim() || "Judge summary unavailable",
      comparison: payload.comparison?.trim() || this.defaultComparison(responses),
      consensusAnswer: payload.consensus_answer?.trim() || undefined,
      supportingAgents,
      dissentingAgents,
      consensusStrength,
      majorityApplicable,
      needsHumanReview,
      judgeReason: payload.judge_reason?.trim() || "Judge reason unavailable",
      recommendedAgent: recommendedAgent ?? undefined,
      scores,
      provider: "ollama",
    };
  }

  private normalizeScores(
    scores: Partial<Record<AgentId, number>> | undefined,
    responses: Record<AgentId, AgentResponse>,
    supportingAgents: AgentId[],
    dissentingAgents: AgentId[],
  ): Record<AgentId, number> {
    const fallback = this.defaultScores(responses, supportingAgents, dissentingAgents);
    if (!scores) {
      return fallback;
    }

    return {
      codex: this.clampScore(scores.codex ?? fallback.codex),
      claude: this.clampScore(scores.claude ?? fallback.claude),
      gemini: this.clampScore(scores.gemini ?? fallback.gemini),
    };
  }

  private defaultScores(
    responses: Record<AgentId, AgentResponse>,
    supportingAgents: AgentId[],
    dissentingAgents: AgentId[],
  ): Record<AgentId, number> {
    return {
      codex: this.defaultScoreForAgent("codex", responses, supportingAgents, dissentingAgents),
      claude: this.defaultScoreForAgent("claude", responses, supportingAgents, dissentingAgents),
      gemini: this.defaultScoreForAgent("gemini", responses, supportingAgents, dissentingAgents),
    };
  }

  private defaultScoreForAgent(
    agentId: AgentId,
    responses: Record<AgentId, AgentResponse>,
    supportingAgents: AgentId[],
    dissentingAgents: AgentId[],
  ): number {
    const response = responses[agentId];
    if (response.status === "failed" || response.status === "timed_out" || response.output.length === 0) {
      return 1;
    }
    if (supportingAgents.includes(agentId)) {
      return 5;
    }
    if (dissentingAgents.includes(agentId)) {
      return 3;
    }
    return 4;
  }

  private defaultComparison(responses: Record<AgentId, AgentResponse>): string {
    return AGENT_IDS.map(
      (agentId) => `${agentId}: ${responses[agentId].status}, ${responses[agentId].output.length} chars`,
    ).join("\n");
  }

  private normalizeAgents(value: string[] | undefined): AgentId[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => this.normalizeAgent(entry))
      .filter((entry): entry is AgentId => entry !== undefined);
  }

  private normalizeAgent(value: string | null | undefined): AgentId | undefined {
    if (!value) {
      return undefined;
    }

    return AGENT_IDS.find((agentId) => agentId === value);
  }

  private clampScore(value: number): number {
    if (!Number.isFinite(value)) {
      return 1;
    }
    return Math.max(1, Math.min(5, Math.round(value)));
  }

  private async ensureJapanese(judgement: Judgement): Promise<Judgement> {
    const textFields = [
      judgement.summary,
      judgement.comparison,
      judgement.judgeReason,
      judgement.consensusAnswer ?? "",
    ].filter((value) => value.trim().length > 0);

    const needsTranslation = textFields.some((value) => this.needsJapaneseTranslation(value));
    if (!needsTranslation) {
      return judgement;
    }

    const translated = await this.translateTextFields(judgement);
    return {
      ...judgement,
      ...translated,
    };
  }

  private async translateTextFields(
    judgement: Judgement,
  ): Promise<Pick<Judgement, "summary" | "comparison" | "judgeReason" | "consensusAnswer">> {
    const response = await fetch(`${this.config.baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        stream: false,
        format: "json",
        prompt: [
          "Translate the following JSON field values into natural Japanese.",
          "Return valid JSON only.",
          'Schema: {"summary":"string","comparison":"string","judge_reason":"string","consensus_answer":"string|null"}',
          JSON.stringify({
            summary: judgement.summary,
            comparison: judgement.comparison,
            judge_reason: judgement.judgeReason,
            consensus_answer: judgement.consensusAnswer ?? null,
          }),
        ].join("\n"),
      }),
    });

    if (!response.ok) {
      throw new Error(`ollama translation returned ${response.status}`);
    }

    const payload = (await response.json()) as OllamaGenerateResponse;
    const parsed = this.parsePayload(payload.response ?? "");
    return {
      summary: parsed.summary?.trim() || judgement.summary,
      comparison: parsed.comparison?.trim() || judgement.comparison,
      judgeReason: parsed.judge_reason?.trim() || judgement.judgeReason,
      consensusAnswer: parsed.consensus_answer?.trim() || judgement.consensusAnswer,
    };
  }

  private needsJapaneseTranslation(value: string): boolean {
    const hasJapanese = /[\u3040-\u30ff\u3400-\u9fff]/.test(value);
    const hasLongEnglishWord = /[A-Za-z]{4,}/.test(value);
    return !hasJapanese || hasLongEnglishWord;
  }

  private classifyPrompt(prompt: string): PromptKind {
    const text = prompt.toLowerCase();
    const subjectivePatterns = [
      /どう思う/,
      /意見/,
      /感想/,
      /賛成/,
      /反対/,
      /どちらがよい/,
      /おすすめ/,
      /べき/,
      /is it better/,
      /what do you think/,
      /opinion/,
      /should i/,
    ];
    const objectivePatterns = [
      /\?/,
      /とは/,
      /いくつ/,
      /何/,
      /バグ/,
      /エラー/,
      /計算/,
      /実装/,
      /write/,
      /fix/,
      /how many/,
      /what is/,
      /\d+\s*[\+\-\*\/]\s*\d+/,
    ];

    if (subjectivePatterns.some((pattern) => pattern.test(text))) {
      return "subjective";
    }
    if (objectivePatterns.some((pattern) => pattern.test(text))) {
      return "objective";
    }
    return "uncertain";
  }
}
