# Email operations

MSF Companion sends email through the web application and Resend. The stopped legacy Function App is not an active email scheduler.

## Message types and triggers

| Message | Trigger | Preference |
|---|---|---|
| Signup welcome | A commander adds an email for the first time | Transactional |
| Premium welcome | Stripe reports the first successful subscription invoice | Transactional |
| Payment failure | Stripe reports a failed invoice, with a seven-day cooldown | Transactional |
| New character | Official game-data sync detects a character not in `GameCharacter`; one alert is sent to every eligible commander mailbox regardless of Free or Premium tier | New character alerts |
| Weekly progress report | Friday at 09:00 UTC through GitHub Actions; includes dated 7+ and 30+ day roster comparisons, an email-safe collection-power chart, recent Advisor activity, fresh official MSF updates, genuine recent unread alerts, and a Discord feedback invitation | Weekly digest |
| Premium lifecycle | Daily GitHub Actions schedule and enabled `churn_prevention` feature flag | Account and progress reminders |
| Inactive/free reminder | Daily GitHub Actions schedule and eligibility/cooldown rules | Account and progress reminders |
| Cancellation feedback | A voluntary Premium cancellation creates a case; the daily job sends the approved feedback-only invitation after 24 hours unless the cancellation is reversed | Announcements |

## Safety controls

- `EMAIL_AUTOMATION_MODE=disabled` sends no scheduled marketing.
- `EMAIL_AUTOMATION_MODE=test` restricts scheduled marketing to the registered commander matching `EMAIL_AUTOMATION_TEST_RECIPIENT`.
- `EMAIL_AUTOMATION_MODE=live` enables the preference-filtered production audience.
- `NEW_CHARACTER_EMAIL_AUTOMATION_MODE` overrides the global mode for
  new-character alerts. Set only this override to `live` to reach the complete
  eligible audience without also enabling lifecycle or win-back campaigns.
- `WEEKLY_EMAIL_AUTOMATION_MODE` overrides the global mode for weekly reports.
  Use this to graduate weekly delivery without activating daily lifecycle or
  win-back campaigns; an invalid override fails closed as `disabled`.
- `CANCELLATION_FEEDBACK_EMAIL_MODE` controls only cancellation research and is
  independently fail-closed. It never inherits the global mode. Use `test`
  during validation and `live` only after the `/admin/cancellation-feedback`
  queue and audience have been reviewed.
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
- The final tracked-send gate also verifies that the account is enabled, the
  address is still the commander's current address, consent provenance exists,
  and the mailbox has no prior hard bounce, complaint, or provider suppression.
- New-character alerts include every enabled Free and Premium commander with a
  non-empty email, recorded consent provenance, and the new-character preference
  enabled. Recipient selection does not filter on subscription tier.
- New-character delivery deduplicates normalized mailboxes, excludes addresses
  with a recorded bounce, complaint, or provider suppression, and paces live
  provider calls. A local preference suppression does not permanently block a
  commander who later opts back in.
- Signed unsubscribe links render a confirmation on `GET`; only signed `POST` requests change preferences.
- Resend webhook signatures are verified before delivery status is updated.
- Cancellation feedback uses the Announcements preference, a 180-day mailbox
  cooldown, one case per Stripe cancellation cycle, and a final Stripe status
  check. Reactivation cancels queued outreach. Payment failures, disputes, and
  administrative subscription deletions do not create feedback invitations.
- The old subscription win-back email is disabled; cancellation mail contains
  no resubscription pitch or incentive.

## Monitoring

Administrators can review audience counts, recent delivery attempts, delivery status, failures, and configuration at `/admin/email-health`. Recipient addresses are not stored in the delivery log; only a SHA-256 hash is retained.

Cancellation outreach and responses are managed at
`/admin/cancellation-feedback`, also linked from the main admin dashboard. The
page shows queued, sent, delivered, response-rate, unreviewed, planned, and
actioned metrics. Each case stores the categorized reason, theme, owner, admin
notes, action summary, action link, and review state. Signed no-login forms feed
the queue automatically. Direct replies still arrive at
`info@themsftoolkit.com`; paste them with **Add a reply from the inbox** so they
enter the same review and action workflow.

The `Email Automation` GitHub Actions workflow runs the schedules and can be dispatched manually. Both endpoints require the repository `CRON_SECRET`, which must match the web application secret.

Production weekly automation is configured with
`WEEKLY_EMAIL_AUTOMATION_MODE=live`, while other scheduled marketing remains in
`test`. Its scheduled run is Friday at 09:00 UTC (04:00 Central during daylight
saving time and 03:00 Central during standard time).

## Production rollout

1. Apply the Prisma migration before deploying application code.
2. Configure `RESEND_WEBHOOK_SECRET` and the Resend webhook endpoint `https://themsftoolkit.com/api/webhooks/resend`.
3. Start with `EMAIL_AUTOMATION_MODE=test` and a registered test commander.
4. Dispatch the relevant jobs and confirm delivery plus webhook status in `/admin/email-health`.
5. Set `NEW_CHARACTER_EMAIL_AUTOMATION_MODE=live` after reviewing its test and
   audience count. Leave the global mode unchanged unless lifecycle and win-back
   campaigns are also approved for live delivery.
6. Set `CANCELLATION_FEEDBACK_EMAIL_MODE=test`, validate a signed form and test
   delivery, then set it to `live` after confirming the cancellation queue.
7. Change the global or weekly mode only after separately reviewing those
   campaigns and their audience counts.
