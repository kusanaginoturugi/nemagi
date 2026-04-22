const ansiPattern =
  // Strip CSI / OSC style sequences from pane capture before diffing or judging.
  // eslint-disable-next-line no-control-regex
  /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g;

export function stripAnsi(input: string): string {
  return input.replace(ansiPattern, "");
}
