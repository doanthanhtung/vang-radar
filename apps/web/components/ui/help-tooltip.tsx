"use client";

import { CircleHelp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TooltipPosition = {
  left: number;
  top: number;
  placement: "above" | "below";
};

export function HelpTooltip({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      setPosition({
        left: Math.max(12, Math.min(window.innerWidth - 12, rect.left + rect.width / 2)),
        top: rect.top > 150 ? rect.top - 8 : rect.bottom + 8,
        placement: rect.top > 150 ? "above" : "below"
      });
    };

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    updatePosition();
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Giải thích: ${text}`}
        aria-expanded={open}
        className={`-m-1.5 inline-grid h-11 w-11 shrink-0 place-items-center rounded-md text-muted transition hover:bg-white/[0.06] hover:text-foreground ${className ?? ""}`}
        onClick={() => setOpen((current) => !current)}
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && position && typeof document !== "undefined"
        ? createPortal(
            <span
              ref={popoverRef}
              role="tooltip"
              className="help-popover"
              style={{
                left: position.left,
                top: position.top,
                transform:
                  position.placement === "above" ? "translate(-50%, -100%)" : "translateX(-50%)"
              }}
            >
              {text}
            </span>,
            document.body
          )
        : null}
    </>
  );
}
