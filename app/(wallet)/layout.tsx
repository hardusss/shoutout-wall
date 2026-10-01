import type { ReactNode } from "react";
import { WalletProviders } from "@/components/WalletProviders";

// The organizer setup and the guest page need a wallet; the projector wall does not.
export default function WalletLayout({ children }: { children: ReactNode }) {
  return <WalletProviders>{children}</WalletProviders>;
}
