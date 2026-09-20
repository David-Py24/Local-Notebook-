# BYOK Free Model Finder — Search & Filter Plan

A design + implementation plan for adding a **searchable, filterable model picker** to the BYOK settings ("AI & BYOK Model Server") so users can quickly find a **free AI** option without knowing provider names, model tags, or where the free tiers are.

---

## Problem

Today the BYOK picker is hard to browse, and free options are buried:

1. **Plain `<select>` dropdown** (`SettingsModal.tsx:842-866`) — 7 static `<option>` rows with misleading labels (e.g. "OpenRouter (Online Hermes 3 / Llama 3.3 / Free Models)" lists "Free Models" but the default model applied is `nousresearch/hermes-3-llama-3.1-405b`, a paid 405B). No way to filter by cost.
2. **Hardcoded model pills** (`SettingsModal.tsx:891-935`) — a few curated tags, including the `google/gemini-2.0-flash-exp:free` pill, but only discoverable if you already know it exists.
3. **Free metadata doesn't exist** — `ProviderPreset` (`providerPresets.ts`) has no `free` / `costTier` / `requiresKey` fields, so the UI cannot reason about cost at all.
4. **Data is duplicated three ways** — `providerPresets.ts` (the canonical catalog), the `<select>` options, the pills, and the "Active Providers Checklist" in `agent_models` (`SettingsModal.tsx:1474-1484`). A catalog change must be repeated in 3 places or they drift (they already have: `deepseek-r1`/`opencode-zen-deepseek` captions differ).
5. **Composer dropdown** (`ModelControls.tsx:181-229`) re-filtering only by `showZenModels`/`showByokModels`/`enabledProviders` — no search, no free filter.

**User story:** "I want to set up AI without paying / without creating an account. Show me what's free." There is currently no answer to this in the UI.

---

## Goals

- G1: A **search box** over BYOK providers + models (matches name, description, base URL, model tag, tags).
- G2: **Filter chips / toggles** — most importantly **"🎉 Free"**, plus "No API key", "Local", "Online".
- G3: **Single source of truth** for the catalog — everything renders from one catalog in `providerPresets.ts`, no more per-sectional hardcoding.
- G4: One-click apply: picking a matched free option sets provider + base URL + model in one action.
- G5: Keep it **non-destructive** to existing settings/keys — search/filter is ephemeral UI state (per-open), not persisted.

Non-goals: billing integration, live price lookups, credential management, changing the chat runtime.

---

## Design

### 1. Data model — extend the catalog (`providerPresets.ts`)

Add cost + capability metadata to `ProviderPreset`:

```ts
export type CostTier = "free" | "freemium" | "paid" | "unknown";
export type ProviderTag = "local" | "online" | "no-key" | "open-weights" | "reasoning" | "fast";

export interface ProviderPreset {
  id: string;
  name: string;
  icon: string;
  desc: string;
  defaultBaseUrl: string;
  defaultModel: string;
  category: "zen" | "byok";
  costTier: CostTier;        // NEW
  requiresKey: boolean;        // NEW (ollama = false)
  tags: ProviderTag[];         // NEW
}
```

Margin notes (verified-at-implementation; repo culture is "verify, don't assume"):

- `ollama_hermes` → `free`, `requiresKey: false`, tags `["local","no-key","open-weights"]`.
- `gemini` direct → `freemium` (generous free tier per-account when no billing; the app already ships the `:free` variant pill).
- `openrouter` → `freemium` (its `:free` suffix models are the actual free path).
- `openai`, `anthropic` → `freemium`/`paid`; leave as "verify at implementation".
- `opencode_zen` family → `freemium`/`free` (share-tier) — verify current terms.

### 2. Add a curated free-model list

New export in `providerPresets.ts` — small, hand-curated, applied on click just like today's pills:

```ts
export interface FreeModelOption {
  id: string;
  providerId: string;   // which ProviderPreset owns it (for base URL + key routing)
  model: string;        // the exact model tag to set
  label: string;        // friendly name
  desc: string;
  needsKey: boolean;    // e.g. OpenRouter/Gemini :free still needs a (free) API key
}

export const FREE_MODELS: FreeModelOption[] = [ /* curated list below */ ];
```

Initial curated set (all "verify current availability at implementation time"):

| ProviderId | Model tag | Note |
|---|---|---|
| `ollama_hermes` | `hermes3:8b` | local, no key |
| `ollama_hermes` | `qwen2.5:7b` / `llama3.2:3b` | local, no key |
| `openrouter` | `google/gemini-2.0-flash-exp:free` | `:free` suffix route |
| `openrouter` | `meta-llama/llama-3.3-70b-instruct:free` | `:free` route |
| `openrouter` | `deepseek/deepseek-v3:free` / `qwen/qwen2.5-vl-72b-instruct:free` | `:free` route |
| `gemini` | `gemini-2.0-flash-exp:free` | API free-tier path |
| `opencode_zen` | `big-pickle` | zen share tier |

### 3. Shared filter helper (testable, no UI)

```ts
export function matchesProviderQuery(
  p: ProviderPreset,
  query: string,
  onlyFree: boolean,
  tags: ProviderTag[],
): boolean;
```

- `query` → case-insensitive substring over `name + desc + defaultBaseUrl + defaultModel + tags.join()`.
- `onlyFree` → `costTier === "free" || (costTier === "freemium" && hasFreePath)`; the "has a free path" flag comes from `tags` (e.g. `freemium` providers carrying a `:free` route are flagged `hasFreePath`).
- Add a `providerHasFreeModel(p): boolean` helper (checks `FREE_MODELS` for a match on `providerId`) so "Show Free only" also surfaces freemium providers that have a working `:free` model this app knows about.

Covered by a Vitest unit test (`providerPresets.test.ts`) — new file, matches the repo's `src/**/*.test.ts` convention.

### 4. UI — "AI & BYOK Model Server" section (`SettingsModal.tsx`)

Add a search/filter control above the provider picker (`SettingsModal.tsx:839`), spanning the provider dropdown + the model pills (share one query + filter state so both lists react together):

```
┌────────────────────────────────────────────┐
│ 🔎  Search providers & models…        [x]  │
│ [🎉 Free only] [🚫 No API key] [🖥 Local]  │
│   → 3 of 12 match · 2 are free             │
└────────────────────────────────────────────┘
```

- **State**: component-local `useState` (`byokQuery`, `byokFilter` set) — ephemeral, NOT persisted, NOT in the Zustand store. Resets on modal close.
- **Provider dropdown**: replace the 7 hardcoded `<option>`s with options generated from `PROVIDER_PRESETS` (filtered by the helper). Render the freed-only list first, or filter outright when "🎉 Free" is on. When only one option matches and Enter is pressed, auto-apply it.
- **Model pills**: the static pills (`SettingsModal.tsx:891-935`) are replaced by pills generated from `FREE_MODELS` + the existing preset-pill list, filtered/highlighted by the same query/filter. Free entries get a green `FREE` badge; no-key entries get a `no key` badge.
- **Empty state**: "No providers match — clear filters or search again" + a **one-click "Use free option"** fallback row that applies `hermes3:8b`/Ollama.
- Keep the existing `Test Connection` / `Fetch Available Models` buttons untouched (they already surface live free models via the dynamic pills at `SettingsModal.tsx:937-957`).

### 5. UI — "Active Providers Checklist" (`agent_models` section)

Replace the hardcoded array at `SettingsModal.tsx:1474-1484` with `PROVIDER_PRESETS.map(...)` (same fields: id/label/icon/cat). Add the same search+Free filter at the top of that checklist so toggling is also findable. This kills duplication #4.

### 6. UI — composer dropdown (`ModelControls.tsx`) — optional nicety

Add a compact search input atop the dropdown popover (`ModelControls.tsx:182-186`) reusing the same `matchesProviderQuery` helper against `filteredPresets`. Out of scope for the first cut if time-boxed; the settings page is the primary surface.

---

## Non-destructive guarantees

- Search/filter is **ephemeral local state** — never written to `localStorage` or the Zustand store. Closing Settings resets it.
- Applying a free option only mutates the existing `aiProvider` / `aiBaseUrl` / `aiModelName` settings via the existing `updateSettings` path — same behavior as today's dropdown.
- `requiresKey: false` options (Ollama) leave the user's key field untouched; the UI shows "Not required for local Ollama" placeholder already.
- MCP connectors, BYOK runtime, and memory layers are untouched (pure frontend/settings change).

---

## Implementation steps

1. **Catalog** (`providerPresets.ts`): add `CostTier`, `ProviderTag`, extend `ProviderPreset` data for all 10 presets; add `FREE_MODELS`, `matchesProviderQuery`, `providerHasFreeModel`.
2. **Tests**: new `src/services/providerPresets.test.ts` covering `matchesProviderQuery` (free-only, no-key, local, mixed query, empty) + `providerHasFreeModel`.
3. **SettingsModal** (`ai_byok`): add search box + filter chips + match-count line; generate provider `<select>` options and model pills from the catalog/`FREE_MODELS`; add empty-state + one-click-free apply.
4. **SettingsModal** (`agent_models`): drive the Provider Checklist from the catalog; add the same filter.
5. **ModelControls.tsx** (optional): search input in the dropdown popover.
6. **Cleanup**: delete the now-redundant hardcoded `<option>`/pill/checklist arrays; confirm nothing else imports the removed literals.
7. **Verify**: `npx tsc --noEmit`, `npm run build`, `npm test`, manual smoke of Settings → AI & BYOK → search "free" → apply → Test Connection.

---

## Edge cases

- **OpenRouter `:free` requires a key** — even free tier. UI must say so explicitly ("Free model, but needs a free OpenRouter key") so users aren't misled; the "No API key" filter excludes these.
- **`freemium` vs "Free only"** — "🎉 Free" shows strictly-free (`costTier === "free"`) plus freemium providers only when a known `FREE_MODELS` entry exists for them.
- **Custom endpoint** — always shown regardless of filters; a query/filter should not silently hide the user's active custom config, or they could lose their current setup. Guard: if the currently-selected provider is filtered out, keep it visible with a "current" badge.
- **Fabricated free claims** — repo rule: verify current free-tier terms at implementation time; leave `unknown` as the default when unsure (fail closed, not loud).