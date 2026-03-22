"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useForgeStore } from "@/lib/store";
import { Vessel } from "./Vessel";

export function Canvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const vessels = useForgeStore((s) => s.vessels);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-no-pan]")) return;
      setIsPanning(true);
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    },
    [pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      setPan({
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y,
      });
    },
    [isPanning]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("[data-no-pan]")) return;
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      const newZoom = Math.min(3, Math.max(0.3, zoom + delta));
      const scale = newZoom / zoom;
      setPan((p) => ({
        x: mx - scale * (mx - p.x),
        y: my - scale * (my - p.y),
      }));
      setZoom(newZoom);
    },
    [zoom]
  );

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  return (
    <div
      ref={canvasRef}
      className="absolute inset-0 overflow-hidden"
      style={{ cursor: isPanning ? "grabbing" : "grab", background: "var(--bg)" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Dot grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(160, 145, 128, 0.65) 1.1px, transparent 1.1px)",
          backgroundSize: `${30 * zoom}px ${30 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      />

      {/* Transform layer */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {vessels.map((vessel) => (
          <Vessel key={vessel.id} vessel={vessel} />
        ))}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-5 right-5 flex gap-1 z-10" data-no-pan>
        <button
          onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}
          className="w-8 h-8 rounded-lg border flex items-center justify-center text-base font-light transition-colors hover:border-gray-400"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--text-muted)",
          }}
        >
          -
        </button>
        <div
          className="px-2 h-8 flex items-center text-xs rounded-lg border select-none"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--text-muted)",
          }}
        >
          {Math.round(zoom * 100)}%
        </div>
        <button
          onClick={() => setZoom((z) => Math.min(3, z + 0.15))}
          className="w-8 h-8 rounded-lg border flex items-center justify-center text-base font-light transition-colors hover:border-gray-400"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--text-muted)",
          }}
        >
          +
        </button>
        <button
          onClick={() => {
            setPan({ x: 0, y: 0 });
            setZoom(1);
          }}
          className="w-8 h-8 rounded-lg border flex items-center justify-center text-xs ml-1 transition-colors hover:border-gray-400"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--text-muted)",
          }}
        >
          &#x2302;
        </button>
      </div>
    </div>
  );
}
