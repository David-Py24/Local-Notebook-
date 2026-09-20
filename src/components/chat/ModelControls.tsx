import { useEffect, useRef, useState } from "react";
import { useStore } from "../../stores/useStore";
import { PROVIDER_PRESETS, getProviderPreset } from "../../services/providerPresets";

export function ModelControls() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const opencodeStatus = useStore((s) => s.opencodeStatus);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const ref = useRef<HTMLDivElement | null>(null);

  const agentModelSettings = settings.agentModelSettings || {
    modelDisplayMode: "auto_collapse",
    showZenModels: true,
    showByokModels: true,
    enabledProviders: {},
    modelAliases: {},
  };

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowDropdown(false);
    };
    window.addEventListener("mousedown", onOutside);
    return () => window.removeEventListener("mousedown", onOutside);
  }, []);

  // Determine if collapsed state is forced by user settings
  const shouldCollapse =
    agentModelSettings.modelDisplayMode === "compact_pill"
      ? true
      : agentModelSettings.modelDisplayMode === "full_badge"
      ? false
      : isCollapsed;

  const getAlias = (raw: string) => agentModelSettings.modelAliases[raw] || raw;

  const engine = settings.assistantEngine;

  if (engine === "opencode") {
    const statusDot =
      opencodeStatus === "ready"
        ? "bg-chat-tool-ok"
        : opencodeStatus === "error"
          ? "bg-chat-tool-error"
          : opencodeStatus === "starting"
            ? "bg-chat-warn animate-pulse"
            : "bg-border";

    const rawModelDisplay = settings.aiModelName ? settings.aiModelName : "OpenCode Agent";
    const modelDisplay = getAlias(rawModelDisplay);

    return (
      <div className="flex items-center gap-1">
        <div
          title={shouldCollapse ? `Model: ${modelDisplay} (Click to expand)` : "Click to collapse model label"}
          className="flex h-6 items-center gap-1 rounded-full border border-border/60 bg-bg/80 px-1.5 py-0.5 text-[10.5px] font-medium text-text select-none shadow-sm hover:border-accent/40 transition-all duration-200"
        >
          {/* Icon button toggles collapse state */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[9px] font-bold text-accent cursor-pointer hover:bg-accent/30 transition-colors"
          >
            Z
          </button>

          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot}`} />

          {/* Collapsible Model Name Label */}
          <div
            className={`flex items-center transition-all duration-200 ease-in-out overflow-hidden ${
              shouldCollapse ? "max-w-0 opacity-0" : "max-w-[130px] opacity-100 ml-0.5"
            }`}
          >
            <span className="truncate font-medium whitespace-nowrap">{modelDisplay}</span>
          </div>

          {/* Expand/Collapse Toggle Indicator */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={shouldCollapse ? "Expand model name" : "Collapse model name"}
            className="text-muted/60 hover:text-text cursor-pointer p-0.5 rounded transition-colors"
          >
            <svg
              className={`h-2.5 w-2.5 transform transition-transform duration-200 ${shouldCollapse ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Filter available provider presets based on agentModelSettings
  const filteredPresets = PROVIDER_PRESETS.filter((p) => {
    if (p.category === "zen" && !agentModelSettings.showZenModels) return false;
    if (p.category === "byok" && !agentModelSettings.showByokModels) return false;
    if (
      agentModelSettings.enabledProviders &&
      agentModelSettings.enabledProviders[p.id] === false
    ) {
      return false;
    }
    return true;
  });

  const modelsList = [
    ...filteredPresets.map((p) => ({
      id: p.id,
      model: p.defaultModel,
      name: p.name,
      icon: p.icon,
      desc: p.desc,
      category: p.category,
    })),
    { id: "custom", model: settings.aiModelName || "custom-model", name: "Custom Endpoint", icon: "⚙️", desc: "vLLM / LM Studio / Local Proxy", category: "byok" as const },
  ];

  const currentPreset = modelsList.find((m) => m.id === settings.aiProvider);
  const rawModelDisplay = settings.aiModelName || "hermes3:8b";
  const activeModelDisplay = getAlias(rawModelDisplay);

  return (
    <div className="relative" ref={ref}>
      <div className="flex h-6 items-center gap-1 rounded-full border border-border/60 bg-bg/80 px-1.5 py-0.5 text-[10.5px] font-medium text-text hover:border-accent/50 transition-all duration-200 shadow-sm">
        {/* Model Icon Button: click toggles collapse */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={shouldCollapse ? `Active Model: ${activeModelDisplay} (Click to expand)` : "Click to collapse model label"}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[9px] font-bold text-accent cursor-pointer hover:bg-accent/30 transition-colors"
        >
          {currentPreset?.icon || "Z"}
        </button>

        {/* Collapsible Text Label */}
        <div
          onClick={() => setShowDropdown(!showDropdown)}
          className={`flex items-center cursor-pointer transition-all duration-200 ease-in-out overflow-hidden ${
            shouldCollapse ? "max-w-0 opacity-0" : "max-w-[120px] opacity-100 ml-0.5"
          }`}
        >
          <span className="truncate font-medium whitespace-nowrap">{activeModelDisplay}</span>
        </div>

        {/* Dropdown Arrow Switcher Trigger */}
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          title="Switch AI engine or model"
          className="flex items-center justify-center p-0.5 text-muted/70 hover:text-text cursor-pointer transition-colors"
        >
          <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Collapse / Expand Caret Toggle Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={shouldCollapse ? "Expand model label" : "Collapse model label"}
          className="flex items-center justify-center p-0.5 text-muted/60 hover:text-text cursor-pointer transition-colors"
        >
          <svg
            className={`h-2.5 w-2.5 transform transition-transform duration-200 ${shouldCollapse ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      {/* Model Selector Dropdown Popover */}
      {showDropdown && (
        <div className="absolute bottom-full mb-2 left-0 z-50 flex w-64 flex-col rounded-2xl border border-border/80 bg-card p-1.5 text-xs text-text shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="px-2.5 py-1 text-[10px] font-semibold uppercase text-muted/70 border-b border-border/40 mb-1 flex items-center justify-between">
            <span>Engine & Model Switcher</span>
            <span className="text-[9px] font-mono text-accent">Zen / BYOK</span>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-0.5">
            {modelsList.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  const defaultUrl = getProviderPreset(m.id)?.defaultBaseUrl ?? settings.aiBaseUrl;
                  updateSettings({
                    aiProvider: m.id,
                    aiModelName: m.model,
                    aiBaseUrl: defaultUrl,
                  });
                  setShowDropdown(false);
                }}
                className={`w-full flex items-center justify-between rounded-xl px-2.5 py-1.5 text-left cursor-pointer transition-colors ${
                  settings.aiProvider === m.id
                    ? "bg-accent text-white font-medium shadow-sm"
                    : "hover:bg-bg/70 text-text/90"
                }`}
              >
                <div className="flex min-w-0 flex-col flex-1">
                  <div className="flex items-center justify-between gap-1 font-medium truncate">
                    <div className="flex items-center gap-1.5 truncate">
                      <span>{m.icon}</span>
                      <span className="truncate">{getAlias(m.name)}</span>
                    </div>
                    {m.category === "zen" ? (
                      <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.2 text-[8.5px] font-bold text-amber-300">
                        ⚡ Zen
                      </span>
                    ) : (
                      <span className="shrink-0 rounded bg-blue-500/15 px-1.5 py-0.2 text-[8.5px] font-medium text-blue-300">
                        BYOK
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] leading-tight truncate ${settings.aiProvider === m.id ? "text-white/80" : "text-muted"}`}>
                    {m.desc}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}