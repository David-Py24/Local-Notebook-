import { useRef } from "react";
import TopBar from "./TopBar";
import Navbar from "./Navbar";
import AssistantPanel from "./AssistantPanel";
import SourcesPanel from "./SourcesPanel";
import StudyBoard from "./StudyBoard";
import SettingsModal from "./SettingsModal";
import WorkspaceLauncherModal from "./WorkspaceLauncherModal";
import PanelLayoutModal from "./PanelLayoutModal";
import WelcomeOnboarding from "./WelcomeOnboarding";
import PanelDragHandle, { PANEL_DRAG_MIME } from "./PanelDragHandle";
import { useStore, SidePanelId } from "../stores/useStore";

interface EdgeResizerProps {
  onResize: (delta: number) => void;
}

function EdgeResizer({ onResize }: EdgeResizerProps) {
  const isDragging = useRef(false);
  const lastX = useRef(0);

  // Pointer Capture (not window-level mousemove/mouseup listeners) so the drag can't get
  // stuck: with plain mouse events, releasing the button outside the app window never
  // fires "mouseup" there, leaving isDragging permanently true and making the panel keep
  // resizing on unrelated later mouse movement. setPointerCapture guarantees this element
  // keeps receiving pointermove/pointerup for this gesture regardless of where the pointer
  // physically ends up.
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    lastX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const delta = e.clientX - lastX.current;
    lastX.current = e.clientX;
    onResize(delta);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="group relative flex w-1 shrink-0 cursor-col-resize items-center justify-center transition-colors hover:bg-accent/80 active:bg-accent z-10"
      title="Drag panel border to resize"
    >
      <div className="h-8 w-0.5 rounded-full bg-border/40 group-hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

export default function Layout() {
  const panelOrder = useStore((s) => s.panelOrder);
  const reorderPanels = useStore((s) => s.reorderPanels);

  const showAssistantPanel = useStore((s) => s.showAssistantPanel);
  const assistantWidth = useStore((s) => s.assistantWidth);
  const setAssistantWidth = useStore((s) => s.setAssistantWidth);

  const showSourcesPanel = useStore((s) => s.showSourcesPanel);
  const sourcePanelWidth = useStore((s) => s.sourcePanelWidth);
  const setSourcePanelWidth = useStore((s) => s.setSourcePanelWidth);

  const cornerRoundness = useStore((s) => s.settings.cornerRoundness);

  const handleAssistantResize = (delta: number) => {
    const next = Math.min(Math.max(assistantWidth + delta, 260), 650);
    setAssistantWidth(next);
  };

  const handleSourcesResize = (delta: number) => {
    const next = Math.min(Math.max(sourcePanelWidth + delta, 160), 500);
    setSourcePanelWidth(next);
  };

  // Data-driven side-panel config, rendered in the order given by `panelOrder`.
  // StudyBoard is always the fixed center pane and isn't part of this list.
  const panelConfig: Record<
    SidePanelId,
    { visible: boolean; width: number; onResize: (delta: number) => void; Component: React.ComponentType }
  > = {
    assistant: { visible: showAssistantPanel, width: assistantWidth, onResize: handleAssistantResize, Component: AssistantPanel },
    sources: { visible: showSourcesPanel, width: sourcePanelWidth, onResize: handleSourcesResize, Component: SourcesPanel },
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
      {/* Global TopBar across the entire top */}
      <TopBar />

      {/* Main workspace container with tight panel gaps (gap-1) and outer border removal */}
      <div className="flex flex-1 overflow-hidden p-1 gap-1">
        {/* Far-left Icon Navigation Bar (Fixed w-12) */}
        <Navbar />

        {/* Side panels, rendered left-to-right in the order given by panelOrder state */}
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

        {/* Study Board Document Workspace (fixed center pane) */}
        <div className="min-w-0 flex-1 h-full">
          <StudyBoard />
        </div>
      </div>

      {/* Settings Modal (800x600) */}
      <SettingsModal />

      {/* Launcher Window Modal */}
      <WorkspaceLauncherModal />

      {/* Panel Layout Customizer Modal */}
      <PanelLayoutModal />

      {/* Welcome / Onboarding Overlay */}
      <WelcomeOnboarding />
    </div>
  );
}
