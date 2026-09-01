import { SidePanelId } from "../stores/useStore";

export const PANEL_DRAG_MIME = "application/x-lsn-panel-id";

interface PanelDragHandleProps {
  panelId: SidePanelId;
}

export default function PanelDragHandle({ panelId }: PanelDragHandleProps) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(PANEL_DRAG_MIME, panelId);
        e.dataTransfer.effectAllowed = "move";
      }}
      title="Drag to reorder panel"
      className="group absolute inset-x-0 top-0 z-20 flex h-2.5 cursor-grab items-center justify-center active:cursor-grabbing"
    >
      <div className="h-0.5 w-6 rounded-full bg-border/60 transition-colors group-hover:bg-accent/70" />
    </div>
  );
}
