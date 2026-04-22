export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function commandFromArgs(parts: string[]): string {
  return parts.map(shellEscape).join(" ");
}
