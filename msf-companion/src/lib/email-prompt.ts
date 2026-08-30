export interface EmailPromptContext {
  email: string | null;
  disabled: boolean;
  promptRequiredForLogin: boolean | undefined;
}

/**
 * Email collection is tied to a real OAuth login. A dismissal suppresses the
 * modal for the rest of that authenticated session; the next OAuth callback
 * opts the session back in so commanders without an address are asked again.
 */
export function shouldShowEmailPrompt({
  email,
  disabled,
  promptRequiredForLogin,
}: EmailPromptContext): boolean {
  return (
    promptRequiredForLogin === true &&
    !disabled &&
    !email?.trim()
  );
}
