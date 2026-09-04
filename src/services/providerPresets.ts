export interface ProviderPreset {
  id: string;
  name: string;
  icon: string;
  desc: string;
  defaultBaseUrl: string;
  defaultModel: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "ollama_hermes",
    name: "Nous Hermes 3 (Local)",
    icon: "🦙",
    desc: "Offline function tool calling agent",
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultModel: "hermes3:8b",
  },
  {
    id: "openrouter",
    name: "Nous Hermes 3 (OpenRouter)",
    icon: "🌐",
    desc: "Online 405B reasoning & synthesis",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "nousresearch/hermes-3-llama-3.1-405b",
  },
  {
    id: "openai",
    name: "OpenAI GPT-4o Mini",
    icon: "⚡",
    desc: "Fast & lightweight cloud reasoning",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
  },
  {
    id: "anthropic",
    name: "Claude Sonnet 5",
    icon: "✨",
    desc: "Deep study & synthesis model",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-5",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    icon: "💎",
    desc: "Multimodal study tutor — Hermes tools compatible",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
  },
];

export function getProviderPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}
