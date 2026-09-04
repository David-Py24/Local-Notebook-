import { useRef } from "react";

interface EdgeResizerProps {
  onResize: (delta: number) => void;
}

export default function EdgeResizer({ onResize }: EdgeResizerProps) {
  const isDragging = useRef(false);
  const lastX = useRef(0);

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
