export interface ProviderPreset {
  id: string;
  name: string;
  icon: string;
  desc: string;
  defaultBaseUrl: string;
  defaultModel: string;
  category: "zen" | "byok";
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "opencode_zen",
    name: "OpenCode Zen (API Gateway)",
    icon: "☯️",
    desc: "OpenCode curated OpenAI-compatible API gateway (https://opencode.ai/zen/v1)",
    defaultBaseUrl: "https://opencode.ai/zen/v1",
    defaultModel: "big-pickle",
    category: "byok",
  },
  {
    id: "opencode_big_pickle",
    name: "Big Pickle (OpenCode Zen)",
    icon: "🥒",
    desc: "OpenCode default flagship agentic reasoning model",
    defaultBaseUrl: "http://localhost:4096",
    defaultModel: "big-pickle",
    category: "zen",
  },
  {
    id: "opencode_zen_smart",
    name: "OpenCode Zen Smart",
    icon: "⚡",
    desc: "OpenCode Agent native high-capacity reasoning model",
    defaultBaseUrl: "http://localhost:4096",
    defaultModel: "opencode-zen-smart",
    category: "zen",
  },
  {
    id: "opencode_zen_fast",
    name: "OpenCode Zen Fast",
    icon: "🚀",
    desc: "OpenCode Agent low-latency rapid response tier",
    defaultBaseUrl: "http://localhost:4096",
    defaultModel: "opencode-zen-fast",
    category: "zen",
  },
  {
    id: "opencode_zen_deepseek",
    name: "DeepSeek R1 (OpenCode Zen)",
    icon: "🧠",
    desc: "OpenCode Agent deep reasoning & mathematical synthesis",
    defaultBaseUrl: "http://localhost:4096",
    defaultModel: "deepseek-r1",
    category: "zen",
  },
  {
    id: "ollama_hermes",
    name: "Nous Hermes 3 (Local)",
    icon: "🦙",
    desc: "Offline function tool calling agent",
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultModel: "hermes3:8b",
    category: "byok",
  },
  {
    id: "openrouter",
    name: "Nous Hermes 3 (OpenRouter)",
    icon: "🌐",
    desc: "Online 405B reasoning & synthesis",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "nousresearch/hermes-3-llama-3.1-405b",
    category: "byok",
  },
  {
    id: "openai",
    name: "OpenAI GPT-4o Mini",
    icon: "⚡",
    desc: "Fast & lightweight cloud reasoning",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    category: "byok",
  },
  {
    id: "anthropic",
    name: "Claude Sonnet 5",
    icon: "✨",
    desc: "Deep study & synthesis model",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-5",
    category: "byok",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    icon: "💎",
    desc: "Multimodal study tutor — Hermes tools compatible",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
    category: "byok",
  },
];

export function getProviderPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}

