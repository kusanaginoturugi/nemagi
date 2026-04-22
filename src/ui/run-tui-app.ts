import { ClaudeAdapter } from "../agents/claude";
import { CodexAdapter } from "../agents/codex";
import { GeminiAdapter } from "../agents/gemini";
import { Orchestrator } from "../app/orchestrator";
import { loadConfig } from "../config/schema";
import { NemagiTui } from "./tui";

export async function runTuiApp(initialPrompt?: string): Promise<void> {
  const config = loadConfig();
  const tui = new NemagiTui(initialPrompt);

  try {
    const prompt = await tui.askPrompt();
    const orchestrator = new Orchestrator(config, [
      new CodexAdapter(config.agents.codex),
      new ClaudeAdapter(config.agents.claude),
      new GeminiAdapter(config.agents.gemini),
    ]);

    await orchestrator.bootstrap();
    await orchestrator.runTurn(prompt, tui);
  } catch (error) {
    tui.destroy();
    throw error;
  }
}
