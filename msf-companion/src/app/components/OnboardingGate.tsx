"use client";

import { useState } from "react";
import OnboardingTour from "./OnboardingTour";

export default function OnboardingGate() {
  const [completed, setCompleted] = useState(false);

  if (completed) return null;

  return <OnboardingTour onComplete={() => setCompleted(true)} />;
}
