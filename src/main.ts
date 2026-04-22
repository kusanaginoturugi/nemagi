import { ClaudeAdapter } from "./agents/claude";
import { CodexAdapter } from "./agents/codex";
import { GeminiAdapter } from "./agents/gemini";
import { Orchestrator } from "./app/orchestrator";
import { loadConfig } from "./config/schema";
import { TmuxBackend } from "./terminal/tmux-backend";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const bootstrapOnly = args.includes("--bootstrap-only");
  const prompt = args.filter((arg) => arg !== "--bootstrap-only").join(" ").trim();
  if (!bootstrapOnly && !prompt) {
    process.stderr.write("Usage: npm start -- [--bootstrap-only] \"your prompt\"\n");
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();
  const orchestrator = new Orchestrator(config, new TmuxBackend(), [
    new CodexAdapter(config.agents.codex),
    new ClaudeAdapter(config.agents.claude),
    new GeminiAdapter(config.agents.gemini),
  ]);

  const session = await orchestrator.bootstrap();
  if (bootstrapOnly) {
    process.stdout.write(
      JSON.stringify(
        {
          session: session.tmuxSessionName,
          panes: session.panes,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  const result = await orchestrator.runTurn(prompt);
  process.stdout.write(
    JSON.stringify(
      {
        session: session.tmuxSessionName,
        turn: result.turn,
        responses: Object.fromEntries(
          Object.entries(result.responses).map(([id, response]) => [
            id,
            {
              status: response.status,
              chars: response.output.length,
              exitCode: response.exitCode,
            },
          ]),
        ),
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
