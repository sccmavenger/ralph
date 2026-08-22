# Email operations

MSF Companion sends email through the web application and Resend. The stopped legacy Function App is not an active email scheduler.

## Message types and triggers

| Message | Trigger | Preference |
|---|---|---|
| Signup welcome | A commander adds an email for the first time | Transactional |
| Premium welcome | Stripe reports the first successful subscription invoice | Transactional |
| Payment failure | Stripe reports a failed invoice, with a seven-day cooldown | Transactional |
| New character | Official game-data sync detects a character not in `GameCharacter` | New character alerts |
| Weekly digest | Monday GitHub Actions schedule; only sends when tips or unread alerts exist | Weekly digest |
| Premium lifecycle | Daily GitHub Actions schedule and enabled `churn_prevention` feature flag | Account and progress reminders |
| Inactive/free and cancellation win-back | Daily GitHub Actions schedule and eligibility/cooldown rules | Account and progress reminders |

## Safety controls

- `EMAIL_AUTOMATION_MODE=disabled` sends no scheduled marketing.
- `EMAIL_AUTOMATION_MODE=test` restricts scheduled marketing to the registered commander matching `EMAIL_AUTOMATION_TEST_RECIPIENT`.
- `EMAIL_AUTOMATION_MODE=live` enables the preference-filtered production audience.
- Every delivery has a database and Resend idempotency key.
- Marketing mail is checked against the category preference again at send time.
- Signed unsubscribe links render a confirmation on `GET`; only signed `POST` requests change preferences.
- Resend webhook signatures are verified before delivery status is updated.

## Monitoring

Administrators can review audience counts, recent delivery attempts, delivery status, failures, and configuration at `/admin/email-health`. Recipient addresses are not stored in the delivery log; only a SHA-256 hash is retained.

The `Email Automation` GitHub Actions workflow runs the schedules and can be dispatched manually. Both endpoints require the repository `CRON_SECRET`, which must match the web application secret.

## Production rollout

1. Apply the Prisma migration before deploying application code.
2. Configure `RESEND_WEBHOOK_SECRET` and the Resend webhook endpoint `https://themsftoolkit.com/api/webhooks/resend`.
3. Start with `EMAIL_AUTOMATION_MODE=test` and a registered test commander.
4. Dispatch both jobs and confirm delivery plus webhook status in `/admin/email-health`.
5. Change the mode to `live` only after reviewing the test and audience counts.
