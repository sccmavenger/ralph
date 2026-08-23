# Email operations

MSF Companion sends email through the web application and Resend. The stopped legacy Function App is not an active email scheduler.

## Message types and triggers

| Message | Trigger | Preference |
|---|---|---|
| Signup welcome | A commander adds an email for the first time | Transactional |
| Premium welcome | Stripe reports the first successful subscription invoice | Transactional |
| Payment failure | Stripe reports a failed invoice, with a seven-day cooldown | Transactional |
| New character | Official game-data sync detects a character not in `GameCharacter` | New character alerts |
| Weekly progress report | Friday at 09:00 UTC through GitHub Actions; includes dated 7+ and 30+ day roster comparisons, an email-safe collection-power chart, recent Advisor activity, fresh official MSF updates, genuine recent unread alerts, and a Discord feedback invitation | Weekly digest |
| Premium lifecycle | Daily GitHub Actions schedule and enabled `churn_prevention` feature flag | Account and progress reminders |
| Inactive/free and cancellation win-back | Daily GitHub Actions schedule and eligibility/cooldown rules | Account and progress reminders |

## Safety controls

- `EMAIL_AUTOMATION_MODE=disabled` sends no scheduled marketing.
- `EMAIL_AUTOMATION_MODE=test` restricts scheduled marketing to the registered commander matching `EMAIL_AUTOMATION_TEST_RECIPIENT`.
- `EMAIL_AUTOMATION_MODE=live` enables the preference-filtered production audience.
- `WEEKLY_EMAIL_AUTOMATION_MODE` overrides the global mode for weekly reports.
  Use this to graduate weekly delivery without activating daily lifecycle or
  win-back campaigns; an invalid override fails closed as `disabled`.
- Every delivery has a database and Resend idempotency key.
- Verification and test notifications never qualify as weekly digest content.
- Weekly reports skip delivery when no roster, activity, current official update, or genuine alert is available.
- Login can create duplicate roster snapshots. Weekly reports compare against the
  newest snapshot on or before each 7-day and 30-day cutoff, label the exact
  baseline date and elapsed days, and describe a flat period in words instead
  of emitting a cryptic `0 · 0` delta.
- Progress charts use a relative bar scale across at most six dated snapshots;
  the exact collection-power total remains visible beside every bar.
- Weekly candidates need recorded consent provenance in addition to an enabled
  weekly preference. Live delivery is paced to remain below the provider's
  request rate, continues after an individual failure, and returns a failed HTTP
  status after processing when any recipient failed so the idempotent job can be
  retried safely.
- The weekly Discord invitation uses the established MSF Companion community
  invite: `https://discord.gg/2ptFQ2Vefk`.
- Official update links are limited to active Scopely posts published within the previous seven days.
- Marketing mail is checked against the category preference again at send time.
- Signed unsubscribe links render a confirmation on `GET`; only signed `POST` requests change preferences.
- Resend webhook signatures are verified before delivery status is updated.

## Monitoring

Administrators can review audience counts, recent delivery attempts, delivery status, failures, and configuration at `/admin/email-health`. Recipient addresses are not stored in the delivery log; only a SHA-256 hash is retained.

The `Email Automation` GitHub Actions workflow runs the schedules and can be dispatched manually. Both endpoints require the repository `CRON_SECRET`, which must match the web application secret.

Production weekly automation is configured with
`WEEKLY_EMAIL_AUTOMATION_MODE=live`, while other scheduled marketing remains in
`test`. Its scheduled run is Friday at 09:00 UTC (04:00 Central during daylight
saving time and 03:00 Central during standard time).

## Production rollout

1. Apply the Prisma migration before deploying application code.
2. Configure `RESEND_WEBHOOK_SECRET` and the Resend webhook endpoint `https://themsftoolkit.com/api/webhooks/resend`.
3. Start with `EMAIL_AUTOMATION_MODE=test` and a registered test commander.
4. Dispatch both jobs and confirm delivery plus webhook status in `/admin/email-health`.
5. Change the mode to `live` only after reviewing the test and audience counts.
