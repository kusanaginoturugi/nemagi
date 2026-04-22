import { runTuiApp } from "./ui/run-tui-app";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--bootstrap-only")) {
    process.stderr.write("--bootstrap-only is no longer supported. Run `npm start` to launch the TUI.\n");
    process.exitCode = 1;
    return;
  }

  if (args.includes("--help")) {
    process.stdout.write("Usage: npm start -- [optional prompt]\n");
    process.stdout.write("Launches the nemagi TUI. If no prompt is provided, you can enter one in the UI.\n");
    return;
  }

  const prompt = args.join(" ").trim() || undefined;
  await runTuiApp(prompt);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
