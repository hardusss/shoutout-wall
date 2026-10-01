"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { PublicKey } from "@solana/web3.js";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ClusterBadge } from "@/components/ClusterBadge";
import { useAvailableWallets } from "@/components/ConnectWallet";
import { Receipt } from "@/components/Receipt";
import { solscanTxUrl } from "@/lib/config";
import { formatSol, shortAddress } from "@/lib/format";
import { useClock, useIsClient } from "@/lib/hooks";
import { PRINT_ERROR_TEXT, PrintError, classifyPrintError, preparePrintTransaction, type PrintErrorKind } from "@/lib/print";
import {
  MAX_MESSAGE_CHARS,
  RENT_EXEMPT_MIN_LAMPORTS,
  countChars,
  networkFeeLamports,
  sanitizeDraft,
  sanitizeMessage,
} from "@/lib/protocol";
import { parseWallParams, wallQuery, type WallConfig } from "@/lib/wall-link";

type Phase =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "confirming"; signature: string }
  | { kind: "done"; signature: string; message: string; lamports: number; sender: string; time: string }
  | { kind: "error"; error: PrintErrorKind };

const noopSubscribe = () => () => {};

export function SendScreen() {
  const params = useSearchParams();
  const config = useMemo(() => parseWallParams(params), [params]);
  if (!config) return <BrokenSendLink />;
  return <SendForm config={config} initialDraft={params.get("m") ?? ""} initialTip={Number(params.get("tip"))} />;
}

/** Leaves a sender unable to stay rent exempt (or below zero) after tip + fee? */
function cannotAfford(balance: number, tip: number, fee: number): boolean {
  const rest = balance - tip - fee;
  return rest < 0 || (rest > 0 && rest < RENT_EXEMPT_MIN_LAMPORTS);
}

function SendForm({ config, initialDraft, initialTip }: { config: WallConfig; initialDraft: string; initialTip: number }) {
  const { connection } = useConnection();
  const { publicKey, wallet, connected, connecting, select, connect, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const available = useAvailableWallets();
  const isClient = useIsClient();
  const time = useClock();

  const tipOptions = useMemo(() => [1, 2, 5].map((x) => config.minLamports * x), [config.minLamports]);
  const [draft, setDraft] = useState(() => sanitizeDraft(initialDraft));
  const [tip, setTip] = useState(() => (tipOptions.includes(initialTip) ? initialTip : config.minLamports));
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const message = sanitizeMessage(draft);
  const length = countChars(message);
  const busy = phase.kind === "signing" || phase.kind === "confirming";
  const sender = publicKey?.toBase58() ?? null;

  // A fresh blockhash is kept ready so the wallet opens right after the tap. Mobile
  // Wallet Adapter needs to launch the wallet while the tap still counts as a user action.
  const latest = useRef<{ blockhash: string; lastValidBlockHeight: number; at: number } | null>(null);
  const refreshBlockhash = useCallback(async () => {
    const value = await connection.getLatestBlockhash("confirmed");
    latest.current = { ...value, at: Date.now() };
    return latest.current;
  }, [connection]);
  useEffect(() => {
    void refreshBlockhash().catch(() => {});
    const timer = setInterval(() => void refreshBlockhash().catch(() => {}), 20_000);
    return () => clearInterval(timer);
  }, [refreshBlockhash]);

  // The guest's balance, so "not enough SOL" shows before the wallet even opens.
  const [balanceOf, setBalanceOf] = useState<{ owner: string; lamports: number } | null>(null);
  const [balanceCheck, setBalanceCheck] = useState(0);
  const refreshBalance = () => setBalanceCheck((n) => n + 1);
  useEffect(() => {
    if (!publicKey) return;
    let stopped = false;
    const load = () =>
      connection.getBalance(publicKey, "confirmed").then(
        (lamports) => !stopped && setBalanceOf({ owner: publicKey.toBase58(), lamports }),
        () => {},
      );
    void load();
    const timer = setInterval(load, 15_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [connection, publicKey, balanceCheck]);
  const balance = balanceOf && balanceOf.owner === sender ? balanceOf.lamports : null;

  const connectWallet = () => {
    if (wallet && (wallet.readyState === WalletReadyState.Installed || wallet.readyState === WalletReadyState.Loadable)) {
      connect().catch(() => {});
    } else if (available.length === 1) {
      // One wallet here (an in-app browser, or Mobile Wallet Adapter on Android): go
      // straight to it. Selecting it connects right away.
      select(available[0].adapter.name);
    } else {
      setVisible(true);
    }
  };

  const print = async () => {
    if (!publicKey || !message || busy) return;
    setPhase({ kind: "signing" });
    try {
      if (balance !== null && cannotAfford(balance, tip, networkFeeLamports())) throw new PrintError("insufficient");
      const recent =
        latest.current && Date.now() - latest.current.at < 30_000 ? latest.current : await refreshBlockhash();
      const plan = await preparePrintTransaction(connection, {
        sender: publicKey,
        to: new PublicKey(config.to),
        ref: new PublicKey(config.ref),
        lamports: tip,
        message,
        blockhash: recent.blockhash,
        lastValidBlockHeight: recent.lastValidBlockHeight,
      });
      if (balance !== null && cannotAfford(balance, tip, plan.feeLamports)) throw new PrintError("insufficient");

      const signature = await sendTransaction(plan.transaction, connection, { preflightCommitment: "confirmed", maxRetries: 3 });
      setPhase({ kind: "confirming", signature });

      const { value } = await connection.confirmTransaction(
        { signature, blockhash: recent.blockhash, lastValidBlockHeight: recent.lastValidBlockHeight },
        "confirmed",
      );
      if (value.err) throw new PrintError(classifyPrintError(JSON.stringify(value.err)), JSON.stringify(value.err));

      setPhase({ kind: "done", signature, message, lamports: tip, sender: publicKey.toBase58(), time });
      refreshBalance();
    } catch (error) {
      console.warn("[print]", error);
      setPhase({ kind: "error", error: classifyPrintError(error) });
      refreshBalance();
    }
  };

  // Deep links reopen this page (with the draft) inside a wallet's own browser.
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => null,
  );
  const walletLinks = useMemo(() => {
    if (!origin) return null;
    const page = `${origin}/send?${wallQuery(config)}&tip=${tip}${message ? `&m=${encodeURIComponent(message)}` : ""}`;
    const url = encodeURIComponent(page);
    const ref = encodeURIComponent(origin);
    return {
      phantom: `https://phantom.app/ul/browse/${url}?ref=${ref}`,
      solflare: `https://solflare.com/ul/v1/browse/${url}?ref=${ref}`,
    };
  }, [origin, config, tip, message]);

  if (phase.kind === "done") {
    return (
      <Shell config={config}>
        <div className="flex flex-col items-center pt-6 text-center">
          <Receipt
            size="preview"
            message={phase.message}
            sender={phase.sender}
            time={phase.time}
            lamports={phase.lamports}
            seed={phase.signature}
          />
          <h2 className="mt-8 text-3xl font-extrabold">Printed on the wall</h2>
          <p className="mt-2 text-lg text-paper/85">Look up at the screen.</p>
          <a
            href={solscanTxUrl(phase.signature)}
            target="_blank"
            rel="noreferrer"
            className="mt-6 text-lg font-semibold underline decoration-2 underline-offset-4"
          >
            View the transaction on Solscan
          </a>
          <button
            type="button"
            onClick={() => {
              setDraft("");
              setPhase({ kind: "idle" });
            }}
            className="mt-8 h-14 w-full rounded-full bg-paper text-lg font-bold text-ink active:scale-[0.98]"
          >
            Print another message
          </button>
        </div>
      </Shell>
    );
  }

  const noWallet = isClient && !connected && available.length === 0;

  return (
    <Shell config={config}>
      <form
        className="grid gap-6 pb-48"
        onSubmit={(event) => {
          event.preventDefault();
          if (connected) void print();
          else connectWallet();
        }}
      >
        <label className="grid gap-2">
          <span className="text-base font-semibold">Your message</span>
          <textarea
            value={draft}
            onChange={(event) => {
              setDraft(sanitizeDraft(event.target.value));
              if (phase.kind === "error") setPhase({ kind: "idle" });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            rows={3}
            enterKeyHint="done"
            disabled={busy}
            placeholder="Say hi to the room"
            aria-describedby="message-count"
            className="on-paper resize-none rounded-2xl border-0 bg-paper px-4 py-3 text-lg leading-snug text-ink placeholder:text-ink/50 disabled:opacity-70"
          />
          <span id="message-count" className="justify-self-end text-sm tabular-nums text-paper/80">
            {length}/{MAX_MESSAGE_CHARS}
          </span>
        </label>

        <fieldset className="grid gap-2" disabled={busy}>
          <legend className="mb-2 text-base font-semibold">Tip</legend>
          <div className="grid grid-cols-3 gap-2">
            {tipOptions.map((lamports) => (
              <label key={lamports}>
                <input
                  type="radio"
                  name="tip"
                  value={lamports}
                  checked={tip === lamports}
                  onChange={() => setTip(lamports)}
                  className="peer sr-only"
                />
                <span className="flex h-12 cursor-pointer items-center justify-center rounded-full border-2 border-paper/50 text-base font-semibold tabular-nums peer-checked:border-paper peer-checked:bg-paper peer-checked:text-ink peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-paper">
                  {formatSol(lamports)} SOL
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <figure className="grid justify-items-center gap-4 pt-2">
          <Receipt
            size="preview"
            message={message || "Your message prints here"}
            placeholder={!message}
            sender={sender}
            time={time}
            lamports={tip}
            seed={sender ?? "preview"}
          />
          <figcaption className="text-center text-sm text-balance text-paper/80">
            This is how it prints on the wall. Tips go to{" "}
            <span className="whitespace-nowrap">{shortAddress(config.to)}</span>.
          </figcaption>
        </figure>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-paper/15 bg-cobalt-deep px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto grid max-w-md gap-3">
            {phase.kind === "error" ? (
              <p role="alert" className="on-paper rounded-2xl bg-paper px-4 py-3 text-base font-semibold leading-snug text-ink">
                {PRINT_ERROR_TEXT[phase.error]}
                {phase.error === "insufficient" && balance !== null ? (
                  <span className="mt-0.5 block text-sm font-normal text-ink/75">
                    You have {formatSol(balance)} SOL. The tip is {formatSol(tip)} SOL plus a tiny network fee.
                  </span>
                ) : null}
              </p>
            ) : null}

            {noWallet && walletLinks ? (
              <>
                <a
                  href={walletLinks.phantom}
                  className="flex h-14 items-center justify-center rounded-full bg-paper text-lg font-bold text-ink active:scale-[0.98]"
                >
                  Open in Phantom
                </a>
                <a
                  href={walletLinks.solflare}
                  className="flex h-12 items-center justify-center rounded-full border-2 border-paper/60 text-base font-semibold active:scale-[0.98]"
                >
                  Open in Solflare
                </a>
                <p className="text-center text-sm text-paper/80">Your wallet app opens this page so you can sign.</p>
              </>
            ) : (
              <>
                <button
                  type="submit"
                  disabled={!isClient || busy || connecting || (connected && !message)}
                  className="h-14 rounded-full bg-paper text-lg font-bold text-ink transition-transform active:scale-[0.98] disabled:opacity-60"
                >
                  {!connected
                    ? connecting
                      ? "Connecting…"
                      : "Connect wallet"
                    : phase.kind === "signing"
                      ? "Confirm in your wallet…"
                      : phase.kind === "confirming"
                        ? "Printing…"
                        : "Print my message"}
                </button>
                {connected && sender ? (
                  <p className="flex items-center justify-center gap-2 text-sm text-paper/80">
                    <span>Signing as {shortAddress(sender)}</span>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => setVisible(true)}
                      disabled={busy}
                      className="font-semibold text-paper underline underline-offset-2"
                    >
                      Change wallet
                    </button>
                  </p>
                ) : (
                  <p className="text-center text-sm text-paper/80">You sign one transaction. The tip goes to the organizer.</p>
                )}
              </>
            )}
          </div>
        </div>
      </form>
    </Shell>
  );
}

function Shell({ config, children }: { config: WallConfig; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-6">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-base font-semibold text-paper/85">{config.title}</p>
          <ClusterBadge className="flex-none text-xs" />
        </div>
        <h1 className="mt-2 text-[1.75rem] font-extrabold leading-[1.1] tracking-tight text-balance">{config.question}</h1>
      </header>
      {children}
    </main>
  );
}

function BrokenSendLink() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-3xl font-extrabold leading-tight">This link is incomplete.</h1>
      <p className="text-lg text-paper/85">Scan the code on the wall again to print a message.</p>
      <Link href="/" className="text-base font-semibold underline underline-offset-4">
        Or start your own wall
      </Link>
    </main>
  );
}
