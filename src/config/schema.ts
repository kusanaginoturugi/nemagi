import type { AppConfig } from "../types/runtime";
import { defaultConfig } from "./defaults";

export function loadConfig(): AppConfig {
  return defaultConfig;
}
