export type AiProvider = "claude" | "openai" | "gemini";

export const AI_PROVIDERS: AiProvider[] = ["claude", "openai", "gemini"];

export const DEFAULT_AI_PROVIDER: AiProvider = "claude";

export const AI_PROVIDER_CONFIG = {
  claude: {
    label: "Claude (Anthropic)",
    shortLabel: "Claude",
    model: "claude-haiku-4-5",
    placeholder: "sk-ant-api03-...",
    keyPrefix: "sk-ant-",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    consoleLabel: "Anthropic Console",
  },
  openai: {
    label: "OpenAI",
    shortLabel: "OpenAI",
    model: "gpt-5.4-mini",
    placeholder: "sk-proj-...",
    keyPrefix: "sk-",
    consoleUrl: "https://platform.openai.com/api-keys",
    consoleLabel: "OpenAI Platform",
  },
  gemini: {
    label: "Gemini (Google)",
    shortLabel: "Gemini",
    model: "gemini-3.1-flash-lite",
    placeholder: "AIza...",
    keyPrefix: "AIza",
    consoleUrl: "https://aistudio.google.com/apikey",
    consoleLabel: "Google AI Studio",
  },
} as const satisfies Record<
  AiProvider,
  {
    label: string;
    shortLabel: string;
    model: string;
    placeholder: string;
    keyPrefix: string;
    consoleUrl: string;
    consoleLabel: string;
  }
>;
