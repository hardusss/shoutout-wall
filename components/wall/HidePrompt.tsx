"use client";

import { useEffect, useRef } from "react";

/** Organizer moderation: hides a message on this wall. It stays on chain. */
export function HidePrompt({ onHide, onCancel }: { onHide: () => void; onCancel: () => void }) {
  const hideRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    hideRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-label="Hide this message"
      className="on-paper absolute left-1/2 top-1/2 z-40 grid w-max -translate-x-1/2 -translate-y-1/2 gap-2 rounded-2xl bg-paper p-3 text-ink shadow-[0_1rem_2.5rem_rgb(35_38_43/0.45)]"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        ref={hideRef}
        type="button"
        onClick={onHide}
        className="h-12 rounded-full bg-ink px-6 text-[1.125rem] font-semibold text-paper"
      >
        Hide from the wall
      </button>
      <button type="button" onClick={onCancel} className="h-11 rounded-full px-6 text-[1.0625rem] font-medium hover:bg-ink/5">
        Keep it
      </button>
    </div>
  );
}
