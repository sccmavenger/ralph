"use client";

import { useState } from "react";
import EmailModal from "./EmailModal";

export default function EmailModalGate() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return <EmailModal onDismiss={() => setDismissed(true)} />;
}
