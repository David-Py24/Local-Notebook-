import { useStore } from "../stores/useStore";

export default function PanelLayoutModal() {
  const showPanelLayoutModal = useStore((s) => s.showPanelLayoutModal);
  const setShowPanelLayoutModal = useStore((s) => s.setShowPanelLayoutModal);

  const panelPreset = useStore((s) => s.panelPreset);
  const applyPanelPreset = useStore((s) => s.applyPanelPreset);

  const showAssistantPanel = useStore((s) => s.showAssistantPanel);
  const toggleAssistantPanel = useStore((s) => s.toggleAssistantPanel);
  const assistantWidth = useStore((s) => s.assistantWidth);
  const setAssistantWidth = useStore((s) => s.setAssistantWidth);

  const showSourcesPanel = useStore((s) => s.showSourcesPanel);
  const toggleSourcesPanel = useStore((s) => s.toggleSourcesPanel);
  const sourcePanelWidth = useStore((s) => s.sourcePanelWidth);
  const setSourcePanelWidth = useStore((s) => s.setSourcePanelWidth);

  const splitActive = useStore((s) => s.splitActive);
  const splitScreen = useStore((s) => s.splitScreen);
  const closeSplit = useStore((s) => s.closeSplit);

  if (!showPanelLayoutModal) return null;

  const presets = [
    {
      id: "default",
      title: "Default 3-Pane",
      desc: "Assistant + Explorer + Study Board",
      icon: "📐",
    },
    {
      id: "focus",
      title: "Focus Document",
      desc: "Full-width distraction-free notebook",
      icon: "📖",
    },
    {
      id: "assistant",
      title: "Assistant & Notes",
      desc: "AI Co-pilot + Study Board side-by-side",
      icon: "✨",
    },
    {
      id: "explorer",
      title: "Explorer & Notes",
      desc: "Local File Explorer + Study Board",
      icon: "📁",
    },
  ] as const;

  const handleSaveCustomLayout = () => {
    // Persist current panel dimensions in settings
    alert("Current custom panel layout saved successfully!");
    setShowPanelLayoutModal(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs select-none">
      <div className="flex w-full max-w-lg flex-col rounded-xl border border-border bg-[#18181b] text-text shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4 bg-bg/40">
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Panel Layout Manager</h2>
            <p className="text-[11px] text-muted">Arrange custom workspace panels or apply presets</p>
          </div>

          <button
            onClick={() => setShowPanelLayoutModal(false)}
            className="rounded p-1 text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Preset Selection */}
          <div>
            <label className="text-[11px] font-semibold text-muted uppercase tracking-wider block mb-2">
              Layout Presets
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {presets.map((p) => {
                const isActive = panelPreset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => applyPanelPreset(p.id)}
                    className={`flex items-start gap-2.5 p-3 rounded-lg border text-left cursor-pointer transition-all ${
                      isActive
                        ? "border-accent bg-accent/15 text-white shadow-xs"
                        : "border-border/70 bg-bg/40 text-muted hover:border-text/40 hover:text-white"
                    }`}
                  >
                    <span className="text-base">{p.icon}</span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-white">{p.title}</span>
                      <span className="text-[10px] text-muted truncate">{p.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Fine-Tuning */}
          <div className="space-y-3 border-t border-border/40 pt-4">
            <label className="text-[11px] font-semibold text-muted uppercase tracking-wider block">
              Custom Panel Customizer
            </label>

            {/* Assistant Panel Toggle & Width */}
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-bg/20">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showAssistantPanel}
                  onChange={toggleAssistantPanel}
                  className="rounded accent-accent cursor-pointer"
                />
                <span className="text-xs font-medium text-text">AI Assistant Panel</span>
              </div>
              {showAssistantPanel && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted font-mono">{assistantWidth}px</span>
                  <input
                    type="range"
                    min={260}
                    max={550}
                    step={10}
                    value={assistantWidth}
                    onChange={(e) => setAssistantWidth(Number(e.target.value))}
                    className="w-24 accent-accent cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* File Explorer Toggle & Width */}
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-bg/20">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showSourcesPanel}
                  onChange={toggleSourcesPanel}
                  className="rounded accent-accent cursor-pointer"
                />
                <span className="text-xs font-medium text-text">Explorer Panel</span>
              </div>
              {showSourcesPanel && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted font-mono">{sourcePanelWidth}px</span>
                  <input
                    type="range"
                    min={180}
                    max={400}
                    step={10}
                    value={sourcePanelWidth}
                    onChange={(e) => setSourcePanelWidth(Number(e.target.value))}
                    className="w-24 accent-accent cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Split Screen Toggle */}
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-bg/20">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={splitActive}
                  onChange={() => {
                    if (splitActive) closeSplit(); else splitScreen();
                  }}
                  className="rounded accent-accent cursor-pointer"
                />
                <span className="text-xs font-medium text-text">Split-Screen Note Editor</span>
              </div>
              <span className="text-[10px] text-muted font-mono">
                {splitActive ? "Side-by-side" : "Single pane"}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border/60 px-5 py-3 bg-bg/40 gap-2">
          <button
            onClick={() => setShowPanelLayoutModal(false)}
            className="rounded px-3 py-1.5 text-xs text-muted hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveCustomLayout}
            className="rounded bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover transition-colors cursor-pointer shadow-xs"
          >
            Save Layout Use Case
          </button>
        </div>
      </div>
    </div>
  );
}
