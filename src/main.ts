import { runCli } from "./cli";

async function main(): Promise<void> {
  await runCli(process.argv);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
