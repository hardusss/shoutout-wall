import { Suspense } from "react";
import { WallScreen } from "@/components/wall/WallScreen";

export default function WallPage() {
  // The wall is configured entirely by its URL, which is only known in the browser.
  return (
    <Suspense fallback={null}>
      <WallScreen />
    </Suspense>
  );
}
