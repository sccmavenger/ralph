export type EmailAutomationMode = "disabled" | "test" | "live";

export function emailAutomationMode(): EmailAutomationMode {
  const mode = process.env.EMAIL_AUTOMATION_MODE?.trim().toLowerCase();
  return mode === "test" || mode === "live" ? mode : "disabled";
}

export function emailTestRecipient(): string | null {
  return (
    process.env.EMAIL_AUTOMATION_TEST_RECIPIENT?.trim() ||
    process.env.NEW_CHARACTER_EMAIL_TEST?.trim() ||
    null
  );
}
