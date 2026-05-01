#!/usr/bin/env node
import { runTuiApp } from "./ui/run-tui-app";

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const args = argv.slice(2);
  if (args.includes("--bootstrap-only")) {
    process.stderr.write("--bootstrap-only is no longer supported. Run `nemagi` to launch the TUI.\n");
    process.exitCode = 1;
    return;
  }

  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write("Usage: nemagi [optional prompt]\n");
    process.stdout.write("       npm start -- [optional prompt]\n");
    process.stdout.write("Launches the nemagi TUI. If no prompt is provided, you can enter one in the UI.\n");
    return;
  }

  const prompt = args.join(" ").trim() || undefined;
  await runTuiApp(prompt);
}

if (require.main === module) {
  runCli().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
