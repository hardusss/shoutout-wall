"use client";

import type { Connection } from "@solana/web3.js";
import { ClusterBadge } from "@/components/ClusterBadge";
import { QrCode } from "@/components/QrCode";
import { formatSol, shortAddress } from "@/lib/format";
import type { FeedStatus } from "./useWallFeed";
import { useSlot } from "./useSlot";
import type { WallStats } from "./wallState";

const slotFormat = new Intl.NumberFormat("en-US");

/** Live slot number, straight from getSlot. Its own component so ticks don't re-render the wall. */
export function SlotTicker({ connection, status }: { connection: Connection; status: FeedStatus }) {
  const slot = useSlot(connection);
  return (
    <div className="flex flex-none items-center gap-4 pt-2 text-[1.25rem] text-paper/85">
      <ClusterBadge className="text-[1rem]" />
      {status === "offline" ? (
        <span>Can&apos;t reach Solana. Retrying…</span>
      ) : (
        <span className="flex items-center gap-2.5 tabular-nums">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-paper" />
          {slot === null ? "Connecting to Solana…" : `Slot ${slotFormat.format(slot)}`}
        </span>
      )}
    </div>
  );
}

/** The QR on its own long receipt, always visible. */
export function QrReceipt({ url, organizer }: { url: string | null; organizer: string }) {
  return (
    <div className="paper-shadow -rotate-[0.4deg]">
      <div className="paper px-6 pb-9 pt-8">
        <div className="aspect-square w-full">
          {url ? <QrCode value={url} label="QR code that opens the page to print a message" className="size-full" /> : null}
        </div>
        <p className="mt-5 text-[1.75rem] font-bold leading-[1.12] text-balance text-ink">
          Scan, write a message, print it here.
        </p>
        <p className="mt-3 text-[1.25rem] leading-snug text-ink/75">Tips go to {shortAddress(organizer)}.</p>
      </div>
    </div>
  );
}

export function SupportersStrip({ stats }: { stats: WallStats }) {
  return (
    <footer className="mt-4 flex h-[4.25rem] flex-none items-center gap-10 border-t border-paper/25 text-[1.375rem]">
      <div className="flex min-w-0 flex-1 items-center gap-7 overflow-hidden whitespace-nowrap">
        <span className="font-bold">Top supporters</span>
        {stats.supporters.length === 0 ? (
          <span className="text-paper/75">The first tip starts the list.</span>
        ) : (
          stats.supporters.map((supporter) => (
            <span key={supporter.sender} className="tabular-nums text-paper/85">
              <span className="font-semibold text-paper">{shortAddress(supporter.sender)}</span>{" "}
              {formatSol(supporter.lamports)} SOL
            </span>
          ))
        )}
      </div>
      <div className="flex flex-none items-center gap-8 whitespace-nowrap tabular-nums text-paper/85">
        <span>
          <span className="font-bold text-paper">{formatSol(stats.totalLamports)} SOL</span> tipped
        </span>
        <span>
          <span className="font-bold text-paper">{stats.count}</span> {stats.count === 1 ? "message" : "messages"}
        </span>
      </div>
    </footer>
  );
}

const controlClass =
  "h-11 rounded-full bg-paper px-5 text-[1.0625rem] font-semibold text-ink shadow-[0_0.5rem_1.25rem_rgb(35_38_43/0.3)] hover:bg-paper/90";

export function OrganizerControls({
  visible,
  paused,
  waiting,
  hiddenCount,
  onFullscreen,
  onTogglePause,
  onRestoreHidden,
}: {
  visible: boolean;
  paused: boolean;
  waiting: number;
  hiddenCount: number;
  onFullscreen: () => void;
  onTogglePause: () => void;
  onRestoreHidden: () => void;
}) {
  return (
    <div
      className={`on-paper fixed bottom-[6.5rem] right-10 z-50 flex items-center gap-3 transition-opacity duration-300 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!visible}
    >
      {paused && waiting > 0 ? (
        <span className="rounded-full bg-cobalt-deep px-4 py-2 text-[1rem] font-medium text-paper">
          {waiting} waiting to print
        </span>
      ) : null}
      {hiddenCount > 0 ? (
        <button type="button" className={controlClass} onClick={onRestoreHidden} tabIndex={visible ? 0 : -1}>
          Show {hiddenCount} hidden
        </button>
      ) : null}
      <button type="button" className={controlClass} onClick={onTogglePause} tabIndex={visible ? 0 : -1}>
        {paused ? "Resume printing" : "Pause printing"}
      </button>
      <button type="button" className={controlClass} onClick={onFullscreen} tabIndex={visible ? 0 : -1}>
        Full screen <span className="ml-1 text-ink/60">F</span>
      </button>
    </div>
  );
}
