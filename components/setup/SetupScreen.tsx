"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Keypair } from "@solana/web3.js";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ClusterBadge } from "@/components/ClusterBadge";
import { ConnectWallet, useAvailableWallets } from "@/components/ConnectWallet";
import { formatSol, shortAddress } from "@/lib/format";
import { useIsClient } from "@/lib/hooks";
import {
  DEFAULT_QUESTION,
  DEFAULT_TITLE,
  MAX_QUESTION_CHARS,
  MAX_TITLE_CHARS,
  MIN_TIP_OPTIONS,
  cleanLine,
  wallQuery,
} from "@/lib/wall-link";

export function SetupScreen() {
  const router = useRouter();
  const isClient = useIsClient();
  const { publicKey, wallet, connect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const available = useAvailableWallets();
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [minLamports, setMinLamports] = useState<number>(MIN_TIP_OPTIONS[0]);
  const [noWallet, setNoWallet] = useState(false);
  const [starting, setStarting] = useState(false);

  const openWallet = () => {
    if (wallet && (wallet.readyState === WalletReadyState.Installed || wallet.readyState === WalletReadyState.Loadable)) {
      connect().catch(() => {});
    } else if (available.length === 0) {
      setNoWallet(true);
    } else {
      setVisible(true);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!publicKey) {
      openWallet();
      return;
    }
    setStarting(true);
    // A fresh random key is the wall's id. Only its public key is kept: guests add it to
    // their transfer as a read-only account and the wall looks transactions up by it.
    const ref = Keypair.generate().publicKey.toBase58();
    const query = wallQuery({
      to: publicKey.toBase58(),
      ref,
      title: cleanLine(title, MAX_TITLE_CHARS) || DEFAULT_TITLE,
      question: cleanLine(question, MAX_QUESTION_CHARS) || DEFAULT_QUESTION,
      minLamports,
    });
    router.push(`/wall?${query}`);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-5 sm:px-8 sm:py-7">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold">Shoutout Wall</span>
          <ClusterBadge className="text-sm" />
        </div>
        <ConnectWallet onNoWallet={() => setNoWallet(true)} />
      </header>

      <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_27rem] lg:gap-16">
        <section className="max-w-2xl">
          <h1 className="text-5xl font-extrabold leading-[0.95] tracking-tight text-balance sm:text-7xl">
            A live wall of <span className="whitespace-nowrap">on-chain</span> messages for your room.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-paper/85 sm:text-xl">
            Put the wall on the projector. Guests scan the code, write a short message, add a small tip and
            sign one transaction. Their message prints on the wall within seconds.
          </p>
          <ul className="mt-8 grid max-w-xl gap-3 text-base text-paper/85 sm:text-lg">
            <li className="flex gap-3">
              <Dot />
              Tips go straight to your wallet. Nothing in between.
            </li>
            <li className="flex gap-3">
              <Dot />
              Everything lives on Solana. No backend, no database, no sign-ups.
            </li>
            <li className="flex gap-3">
              <Dot />
              The wall is just a link. Refresh it or open it on another laptop and it shows the same messages.
            </li>
          </ul>
        </section>

        <div className="paper-shadow w-full max-w-[27rem] rotate-[0.6deg] justify-self-center lg:justify-self-end">
          <form onSubmit={onSubmit} className="paper on-paper grid gap-6 px-6 pb-9 pt-10 sm:px-8">
            <h2 className="text-2xl font-bold leading-tight">Set up your wall</h2>

            <label className="grid gap-2">
              <span className="text-base font-semibold">Wall title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={MAX_TITLE_CHARS}
                required
                className="h-12 rounded-xl border border-ink/20 bg-ink/[0.03] px-4 text-lg outline-offset-2"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-base font-semibold">Question for the room</span>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={MAX_QUESTION_CHARS}
                rows={2}
                required
                className="resize-none rounded-xl border border-ink/20 bg-ink/[0.03] px-4 py-3 text-lg leading-snug outline-offset-2"
              />
            </label>

            <fieldset className="grid gap-2">
              <legend className="mb-2 text-base font-semibold">Minimum tip</legend>
              <div className="grid grid-cols-3 gap-2">
                {MIN_TIP_OPTIONS.map((lamports) => (
                  <label key={lamports} className="relative">
                    <input
                      type="radio"
                      name="min-tip"
                      value={lamports}
                      checked={minLamports === lamports}
                      onChange={() => setMinLamports(lamports)}
                      className="peer sr-only"
                    />
                    <span className="flex h-12 cursor-pointer items-center justify-center rounded-xl border border-ink/20 text-base font-semibold tabular-nums peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ink">
                      {formatSol(lamports)} SOL
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-3">
              <button
                type="submit"
                disabled={!isClient || connecting || starting}
                className="h-14 rounded-full bg-ink text-lg font-bold text-paper transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {publicKey ? "Start the wall" : connecting ? "Connecting…" : "Connect wallet to start"}
              </button>
              <p className="text-center text-sm text-ink/70" aria-live="polite">
                {isClient && publicKey
                  ? `Tips go to ${shortAddress(publicKey.toBase58())}, the wallet you connected.`
                  : "Tips go to the wallet you connect."}
              </p>
            </div>

            {noWallet ? (
              <p role="status" className="rounded-xl bg-ink/[0.05] p-4 text-base leading-snug">
                No Solana wallet found in this browser. Install{" "}
                <a className="font-semibold underline" href="https://phantom.com/download" target="_blank" rel="noreferrer">
                  Phantom
                </a>{" "}
                or{" "}
                <a className="font-semibold underline" href="https://solflare.com/download" target="_blank" rel="noreferrer">
                  Solflare
                </a>
                , then reload this page.
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </main>
  );
}

function Dot() {
  return <span aria-hidden="true" className="mt-[0.55em] size-2 flex-none rounded-full bg-paper" />;
}
