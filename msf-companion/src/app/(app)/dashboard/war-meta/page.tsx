import { Suspense } from "react";
import WarMetaFullPageClient from "./WarMetaFullPageClient";

export default function WarMetaPage() {
  return (
    <Suspense>
      <WarMetaFullPageClient />
    </Suspense>
  );
}
