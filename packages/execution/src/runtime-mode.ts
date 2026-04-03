export enum RuntimeMode {
  SKILL = "skill",
  HEADLESS = "headless",
}

export function detectRuntimeMode(): RuntimeMode {
  return process.env.CLAUDE_SKILL_DIR ? RuntimeMode.SKILL : RuntimeMode.HEADLESS;
}
