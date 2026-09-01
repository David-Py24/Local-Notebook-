export type ThemeColorMap = {
  bg: string;
  card: string;
  accent: string;
  accentHover: string;
  text: string;
  muted: string;
  border: string;
  serif?: string;
};

export interface ThemeDef {
  id: string;
  name: string;
  description: string;
  colors: ThemeColorMap;
}

// Five dark preset themes
export const THEMES: ThemeDef[] = [
  {
    id: "obsidian-dark",
    name: "Obsidian Dark",
    description: "Classic deep charcoal with a blue accent.",
    colors: {
      bg: "#181818",
      card: "#191919",
      accent: "#3b82f6",
      accentHover: "#2563eb",
      text: "#e5e5e5",
      muted: "#737373",
      border: "#2a2a2a",
    },
  },
  {
    id: "midnight-blue",
    name: "Midnight Blue",
    description: "Cool navy-toned dark palette for night reading.",
    colors: {
      bg: "#0f1420",
      card: "#131a2a",
      accent: "#38bdf8",
      accentHover: "#0ea5e9",
      text: "#dbeafe",
      muted: "#64748b",
      border: "#1e293b",
    },
  },
  {
    id: "nord-dark",
    name: "Nord Dark",
    description: "Calm arctic-inspired palette from the Nord theme.",
    colors: {
      bg: "#2e3440",
      card: "#3b4252",
      accent: "#88c0d0",
      accentHover: "#81a1c1",
      text: "#eceff4",
      muted: "#8b93a5",
      border: "#4c566a",
    },
  },
  {
    id: "dracula-dark",
    name: "Dracula Dark",
    description: "Vivid purple/dark palette with a signature pink accent.",
    colors: {
      bg: "#191a21",
      card: "#21222c",
      accent: "#bd93f9",
      accentHover: "#ff79c6",
      text: "#f8f8f2",
      muted: "#6272a4",
      border: "#282a36",
    },
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    description: "Dark blue-black night palette with electric accents.",
    colors: {
      bg: "#1a1b26",
      card: "#1f2335",
      accent: "#7aa2f7",
      accentHover: "#bb9af7",
      text: "#c0caf5",
      muted: "#565f89",
      border: "#292e42",
    },
  },
];

export const DEFAULT_THEME = THEMES[0];

export function getThemeById(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

export function applyThemeToDocument(colors: ThemeColorMap): void {
  const root = document.documentElement;
  root.style.setProperty("--color-bg", colors.bg);
  root.style.setProperty("--color-card", colors.card);
  root.style.setProperty("--color-accent", colors.accent);
  root.style.setProperty("--color-accent-hover", colors.accentHover);
  root.style.setProperty("--color-text", colors.text);
  root.style.setProperty("--color-muted", colors.muted);
  root.style.setProperty("--color-border", colors.border);
}
