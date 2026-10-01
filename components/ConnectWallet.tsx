"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { shortAddress } from "@/lib/format";
import { useIsClient } from "@/lib/hooks";

export function useAvailableWallets() {
  const { wallets } = useWallet();
  return wallets.filter(
    (w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable,
  );
}

const buttonClass =
  "inline-flex h-12 items-center gap-2.5 rounded-full bg-paper px-5 text-base font-semibold text-ink " +
  "transition-[transform,background-color] hover:bg-paper/90 active:scale-[0.98] disabled:opacity-60";

/** Connect button and account menu, restyled for the wall's palette. */
export function ConnectWallet({ onNoWallet }: { onNoWallet?: () => void }) {
  const isClient = useIsClient();
  const { publicKey, wallet, connected, connecting, connect, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const available = useAvailableWallets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (!isClient) {
    return (
      <button type="button" className={buttonClass} disabled>
        Connect wallet
      </button>
    );
  }

  if (connected && publicKey) {
    const address = publicKey.toBase58();
    return (
      <div ref={menuRef} className="relative">
        <button
          type="button"
          className={buttonClass}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {wallet?.adapter.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wallet.adapter.icon} alt="" className="size-6 rounded-md" />
          ) : null}
          {shortAddress(address)}
        </button>
        {menuOpen ? (
          <div
            role="menu"
            className="on-paper absolute right-0 z-20 mt-2 grid w-52 gap-1 rounded-2xl bg-paper p-2 text-ink shadow-[0_1rem_2rem_rgb(35_38_43/0.3)]"
          >
            <MenuItem
              onClick={async () => {
                await navigator.clipboard?.writeText(address);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? "Copied" : "Copy address"}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                setVisible(true);
              }}
            >
              Change wallet
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                void disconnect();
              }}
            >
              Disconnect
            </MenuItem>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={buttonClass}
      disabled={connecting}
      onClick={() => {
        if (wallet && (wallet.readyState === WalletReadyState.Installed || wallet.readyState === WalletReadyState.Loadable)) {
          connect().catch(() => {});
        } else if (available.length === 0 && onNoWallet) {
          onNoWallet();
        } else {
          setVisible(true);
        }
      }}
    >
      {connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}

function MenuItem({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="h-11 rounded-xl px-3 text-left text-base font-medium hover:bg-ink/5"
    >
      {children}
    </button>
  );
}
