"use client";

import { useState } from "react";
import EmailModal from "./EmailModal";
import OnboardingTour from "./OnboardingTour";

export default function PostLoginGate({
  showEmailModal,
  showOnboarding,
}: {
  showEmailModal: boolean;
  showOnboarding: boolean;
}) {
  const [emailDismissed, setEmailDismissed] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);

  // Step 1: Show email modal if needed
  if (showEmailModal && !emailDismissed) {
    return <EmailModal onDismiss={() => setEmailDismissed(true)} />;
  }

  // Step 2: Show onboarding if needed (after email modal is dismissed)
  if (showOnboarding && !onboardingDone) {
    return <OnboardingTour onComplete={() => setOnboardingDone(true)} />;
  }

  return null;
}
