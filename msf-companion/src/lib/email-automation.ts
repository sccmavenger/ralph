export type EmailAutomationMode = "disabled" | "test" | "live";

function parseAutomationMode(value: string | undefined): EmailAutomationMode {
  const mode = value?.trim().toLowerCase();
  return mode === "test" || mode === "live" ? mode : "disabled";
}

export function emailAutomationMode(): EmailAutomationMode {
  return parseAutomationMode(process.env.EMAIL_AUTOMATION_MODE);
}

export function weeklyEmailAutomationMode(): EmailAutomationMode {
  if (process.env.WEEKLY_EMAIL_AUTOMATION_MODE === undefined) {
    return emailAutomationMode();
  }
  return parseAutomationMode(process.env.WEEKLY_EMAIL_AUTOMATION_MODE);
}

export function emailTestRecipient(): string | null {
  return (
    process.env.EMAIL_AUTOMATION_TEST_RECIPIENT?.trim() ||
    process.env.NEW_CHARACTER_EMAIL_TEST?.trim() ||
    null
  );
}
