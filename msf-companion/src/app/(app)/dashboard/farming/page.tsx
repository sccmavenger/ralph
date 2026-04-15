import { Suspense } from "react";
import FarmingFullPageClient from "./FarmingFullPageClient";

export default function FarmingPage() {
  return (
    <Suspense>
      <FarmingFullPageClient />
    </Suspense>
  );
}
