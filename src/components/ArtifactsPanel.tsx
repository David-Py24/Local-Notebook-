import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useStore, Artifact } from "../stores/useStore";

export default function ArtifactsPanel() {
  const artifacts = useStore((s) => s.artifacts);
  const activeArtifact = useStore((s) => s.activeArtifact);
  const setActiveArtifact = useStore((s) => s.setActiveArtifact);
  const toggleArtifactsPanel = useStore((s) => s.toggleArtifactsPanel);

  return (
    <div className="flex h-full flex-col overflow-hidden panel-rounded bg-card border-l border-border/40">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/30 bg-bg/30 px-3">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-cyan-400 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 8h6M9 12h6M9 16h4" />
          </svg>
          <h2 className="text-xs font-semibold text-text">Artifacts</h2>
        </div>
        <button
          onClick={toggleArtifactsPanel}
          title="Close panel"
          className="rounded p-1 text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {activeArtifact ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between border-b border-border/30 bg-bg/20 px-3 py-2">
              <button
                onClick={() => setActiveArtifact(null)}
                className="text-[10px] font-semibold uppercase text-muted hover:text-white cursor-pointer"
              >
                ← Back to list
              </button>
              <span className="text-[10px] font-mono text-muted uppercase">{activeArtifact.type}</span>
            </div>
            <h3 className="px-3 pt-3 text-sm font-semibold text-text">{activeArtifact.title}</h3>
            <div className="px-3 py-3 text-xs text-text/90 leading-relaxed markdown-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeArtifact.content}</ReactMarkdown>
            </div>
          </div>
        ) : artifacts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <div className="h-12 w-12 rounded-xl border border-border bg-bg/40 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-cyan-400/60 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M4 4h16v6H4zM4 14h16v6H4z" />
              </svg>
            </div>
            <h3 className="text-xs font-semibold text-text mb-1">No artifacts yet</h3>
            <p className="text-[11px] text-muted max-w-[220px]">
              AI-generated artifacts (code, diagrams, summaries) will appear here as you generate them.
            </p>
          </div>
        ) : (
          <ArtifactList artifacts={artifacts} onSelect={setActiveArtifact} />
        )}
      </div>
    </div>
  );
}

function ArtifactList({ artifacts, onSelect }: { artifacts: Artifact[]; onSelect: (a: Artifact) => void }) {
  return (
    <div className="flex flex-col gap-1 p-2">
      {artifacts.map((a) => (
        <button
          key={a.id}
          onClick={() => onSelect(a)}
          className="rounded-md border border-border/60 bg-bg/30 p-2 text-left hover:border-accent/70 hover:bg-bg/60 cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium text-text">{a.title}</span>
            <span className="shrink-0 text-[9px] font-mono uppercase text-muted">{a.type}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[10px] text-muted">{a.content.replace(/[#*`>]/g, "").trim()}</p>
        </button>
      ))}
    </div>
  );
}
