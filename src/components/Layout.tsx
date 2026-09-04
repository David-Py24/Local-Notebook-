import TopBar from "./TopBar";
import Navbar from "./Navbar";
import AssistantPanel from "./AssistantPanel";
import SourcesPanel from "./SourcesPanel";
import ArtifactsPanel from "./ArtifactsPanel";
import AgentPanel from "./AgentPanel";
import StudyBoard from "./StudyBoard";
import SettingsModal from "./SettingsModal";
import WorkspaceLauncherModal from "./WorkspaceLauncherModal";
import PanelLayoutModal from "./PanelLayoutModal";
import WelcomeOnboarding from "./WelcomeOnboarding";
import PanelDragHandle, { PANEL_DRAG_MIME } from "./PanelDragHandle";
import EdgeResizer from "./EdgeResizer";
import { useStore, SidePanelId } from "../stores/useStore";

export default function Layout() {
  const panelOrder = useStore((s) => s.panelOrder);
  const reorderPanels = useStore((s) => s.reorderPanels);

  const showAssistantPanel = useStore((s) => s.showAssistantPanel);
  const assistantWidth = useStore((s) => s.assistantWidth);
  const setAssistantWidth = useStore((s) => s.setAssistantWidth);

  const showSourcesPanel = useStore((s) => s.showSourcesPanel);
  const sourcePanelWidth = useStore((s) => s.sourcePanelWidth);
  const setSourcePanelWidth = useStore((s) => s.setSourcePanelWidth);

  const showArtifactsPanel = useStore((s) => s.showArtifactsPanel);
  const artifactsWidth = useStore((s) => s.artifactsWidth);
  const setArtifactsWidth = useStore((s) => s.setArtifactsWidth);

  const showAgentPanel = useStore((s) => s.showAgentPanel);
  const agentWidth = useStore((s) => s.agentWidth);
  const setAgentWidth = useStore((s) => s.setAgentWidth);

  const cornerRoundness = useStore((s) => s.settings.cornerRoundness);

  const handleAssistantResize = (delta: number) => {
    const next = Math.min(Math.max(assistantWidth + delta, 260), 650);
    setAssistantWidth(next);
  };

  const handleSourcesResize = (delta: number) => {
    const next = Math.min(Math.max(sourcePanelWidth + delta, 160), 500);
    setSourcePanelWidth(next);
  };

  const handleArtifactsResize = (delta: number) => {
    const next = Math.min(Math.max(artifactsWidth - delta, 260), 600);
    setArtifactsWidth(next);
  };

  const handleAgentResize = (delta: number) => {
    const next = Math.min(Math.max(agentWidth - delta, 260), 600);
    setAgentWidth(next);
  };

  const panelConfig: Record<
    SidePanelId,
    { visible: boolean; width: number; onResize: (delta: number) => void; Component: React.ComponentType }
  > = {
    assistant: { visible: showAssistantPanel, width: assistantWidth, onResize: handleAssistantResize, Component: AssistantPanel },
    sources: { visible: showSourcesPanel, width: sourcePanelWidth, onResize: handleSourcesResize, Component: SourcesPanel },
    artifacts: { visible: showArtifactsPanel, width: artifactsWidth, onResize: handleArtifactsResize, Component: ArtifactsPanel },
    agent: { visible: showAgentPanel, width: agentWidth, onResize: handleAgentResize, Component: AgentPanel },
  };

  const roundnessStyle =
    cornerRoundness === "none"
      ? "0px"
      : cornerRoundness === "sm"
      ? "4px"
      : cornerRoundness === "lg"
      ? "12px"
      : "6px";

  return (
    <div
      className="flex h-full w-full flex-col bg-bg text-text overflow-hidden"
      style={{ "--panel-roundness": roundnessStyle } as React.CSSProperties}
    >
      <TopBar />

      <div className="flex flex-1 overflow-hidden p-1 gap-1">
        <Navbar />

        {panelOrder.map((id) => {
          const { visible, width, onResize, Component } = panelConfig[id];
          if (!visible) return null;
          return (
            <div key={id} className="contents">
              <div
                style={{ width }}
                className="relative shrink-0 h-full"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const draggedId = e.dataTransfer.getData(PANEL_DRAG_MIME) as SidePanelId | "";
                  if (draggedId && draggedId !== id) reorderPanels(draggedId, id);
                }}
              >
                <PanelDragHandle panelId={id} />
                <Component />
              </div>
              <EdgeResizer onResize={onResize} />
            </div>
          );
        })}

        <div className="min-w-0 flex-1 h-full">
          <StudyBoard />
        </div>

        {showArtifactsPanel && !panelOrder.includes("artifacts") && (
          <div className="contents">
            <EdgeResizer onResize={handleArtifactsResize} />
            <div style={{ width: artifactsWidth }} className="relative shrink-0 h-full">
              <ArtifactsPanel />
            </div>
          </div>
        )}

        {showAgentPanel && !panelOrder.includes("agent") && (
          <div className="contents">
            <EdgeResizer onResize={handleAgentResize} />
            <div style={{ width: agentWidth }} className="relative shrink-0 h-full">
              <AgentPanel />
            </div>
          </div>
        )}
      </div>

      <SettingsModal />
      <WorkspaceLauncherModal />
      <PanelLayoutModal />
      <WelcomeOnboarding />
    </div>
  );
}
