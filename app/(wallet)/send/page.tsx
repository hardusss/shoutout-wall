import type { Metadata } from "next";
import { Suspense } from "react";
import { SendScreen } from "@/components/send/SendScreen";

export const metadata: Metadata = {
  title: "Print a message · Shoutout Wall",
};

export default function SendPage() {
  return (
    <Suspense fallback={null}>
      <SendScreen />
    </Suspense>
  );
}
