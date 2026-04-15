import { Suspense } from "react";
import FarmingPageClient from "./FarmingPageClient";

export default function FarmingPage() {
  return (
    <Suspense>
      <FarmingPageClient />
    </Suspense>
  );
}
