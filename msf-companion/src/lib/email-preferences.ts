export const EMAIL_PREFERENCE_KEYS = [
  "weeklyDigest",
  "newCharacters",
  "announcements",
  "reengagement",
] as const;

export type EmailPreferenceKey = (typeof EMAIL_PREFERENCE_KEYS)[number];

export interface EmailPreferences {
  weeklyDigest: boolean;
  newCharacters: boolean;
  announcements: boolean;
  reengagement: boolean;
}

export const EMAIL_PREFERENCE_LABELS: Record<EmailPreferenceKey, string> = {
  weeklyDigest: "Weekly digest",
  newCharacters: "New character alerts",
  announcements: "Product and community announcements",
  reengagement: "Account and progress reminders",
};

export function isEmailPreferenceKey(value: unknown): value is EmailPreferenceKey {
  return typeof value === "string" && EMAIL_PREFERENCE_KEYS.includes(value as EmailPreferenceKey);
}

export function commanderEmailPreferences(commander: {
  emailWeeklyDigest: boolean;
  emailNewCharacters: boolean;
  emailAnnouncements: boolean;
  emailReengagement: boolean;
}): EmailPreferences {
  return {
    weeklyDigest: commander.emailWeeklyDigest,
    newCharacters: commander.emailNewCharacters,
    announcements: commander.emailAnnouncements,
    reengagement: commander.emailReengagement,
  };
}

export function preferenceEnabled(
  commander: {
    emailWeeklyDigest: boolean;
    emailNewCharacters: boolean;
    emailAnnouncements: boolean;
    emailReengagement: boolean;
  },
  preference: EmailPreferenceKey
): boolean {
  return commanderEmailPreferences(commander)[preference];
}

export function preferenceUpdateData(preferences: Partial<EmailPreferences>) {
  return {
    ...(preferences.weeklyDigest === undefined
      ? {}
      : {
          emailWeeklyDigest: preferences.weeklyDigest,
          // Compatibility for the stopped legacy Function implementation.
          emailDigestOptOut: !preferences.weeklyDigest,
        }),
    ...(preferences.newCharacters === undefined
      ? {}
      : { emailNewCharacters: preferences.newCharacters }),
    ...(preferences.announcements === undefined
      ? {}
      : { emailAnnouncements: preferences.announcements }),
    ...(preferences.reengagement === undefined
      ? {}
      : { emailReengagement: preferences.reengagement }),
  };
}
