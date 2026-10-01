"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { WalletNotReadyError, type Adapter, type WalletError } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  SolanaMobileWalletAdapter,
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
} from "@solana-mobile/wallet-adapter-mobile";
import { MWA_CHAIN, RPC_URL, WS_URL } from "@/lib/config";

/** Android Chrome (not a webview): the only place Mobile Wallet Adapter works. */
function isAndroidBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const webView = /(WebView|Version\/.+(Chrome)\/(\d+)\.(\d+)\.(\d+)\.(\d+)|; wv\).+(Chrome)\/(\d+)\.(\d+)\.(\d+)\.(\d+))/i;
  return /android/i.test(ua) && !webView.test(ua);
}

export function WalletProviders({ children }: { children: ReactNode }) {
  // Wallet Standard wallets (Phantom, Solflare, Backpack, wallet in-app browsers) are
  // detected automatically. Mobile Wallet Adapter is added explicitly so it uses the
  // configured cluster instead of guessing it from the RPC URL.
  const wallets = useMemo<Adapter[]>(() => {
    if (!isAndroidBrowser()) return [];
    return [
      new SolanaMobileWalletAdapter({
        addressSelector: createDefaultAddressSelector(),
        appIdentity: { name: "Shoutout Wall", uri: window.location.origin, icon: "/icon-192.png" },
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        chain: MWA_CHAIN,
        onWalletNotFound: createDefaultWalletNotFoundHandler(),
      }),
    ];
  }, []);

  const onError = useCallback((error: WalletError, adapter?: Adapter) => {
    console.warn("[wallet]", error.name, error.message);
    if (error instanceof WalletNotReadyError && adapter) window.open(adapter.url, "_blank", "noopener");
  }, []);

  return (
    <ConnectionProvider endpoint={RPC_URL} config={{ commitment: "confirmed", wsEndpoint: WS_URL }}>
      <WalletProvider wallets={wallets} onError={onError} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
