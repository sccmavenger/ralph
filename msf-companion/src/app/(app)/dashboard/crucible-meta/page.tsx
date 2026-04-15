import { Suspense } from "react";
import CrucibleMetaFullPageClient from "./CrucibleMetaFullPageClient";

export default function CrucibleMetaPage() {
  return (
    <Suspense>
      <CrucibleMetaFullPageClient />
    </Suspense>
  );
}
