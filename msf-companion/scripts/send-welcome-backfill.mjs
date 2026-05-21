// Welcome backfill — sends a welcome email to commanders who signed up since the last
// community email (2026-04-29) and never received any onboarding email.
//
// Usage:
//   DRY RUN:  node scripts/send-welcome-backfill.mjs --dry-run
//   SEND:     node scripts/send-welcome-backfill.mjs --send
//
// Optional: --cutoff=YYYY-MM-DD to override the default 2026-04-29 cutoff.
//
// Requires env vars: PROD_DATABASE_URL, RESEND_API_KEY

import pg from 'pg';
import { Resend } from 'resend';
import { buildWelcomeBackfillHtml } from './welcome-backfill-template.mjs';

const SKIP_EMAIL = 'dguilloryjr@msn.com';
const SUBJECT = "Welcome to MSF Companion, Commander — Your Command Center Awaits";
const FROM = 'MSF Companion <info@themsftoolkit.com>';
const DEFAULT_CUTOFF = '2026-04-29'; // Date of prior community email

const delay = ms => new Promise(r => setTimeout(r, ms));

const dryRun = process.argv.includes('--dry-run');
const doSend = process.argv.includes('--send');
const cutoffArg = process.argv.find(a => a.startsWith('--cutoff='));
const cutoff = cutoffArg ? cutoffArg.split('=')[1] : DEFAULT_CUTOFF;

if (!dryRun && !doSend) {
  console.error('Usage: node send-welcome-backfill.mjs --dry-run | --send  [--cutoff=YYYY-MM-DD]');
  process.exit(1);
}

if (!process.env.PROD_DATABASE_URL) {
  console.error('Missing PROD_DATABASE_URL env var.');
  process.exit(1);
}

console.log(`Using cutoff: ${cutoff} (commanders created on or after this date)\n`);

const pool = new pg.Pool({ connectionString: process.env.PROD_DATABASE_URL });
// Exclude PREMIUM subscribers — they already received a tailored welcome email
// from the Stripe subscription webhook (see src/lib/welcome-email.ts).
const { rows } = await pool.query(
  `
  SELECT email, "displayName", "subscriptionTier", "createdAt"
  FROM "Commander"
  WHERE email IS NOT NULL
    AND email != ''
    AND disabled = false
    AND "emailDigestOptOut" = false
    AND "subscriptionTier" != 'PREMIUM'
    AND "createdAt" >= $1::timestamp
  ORDER BY "createdAt"
  `,
  [cutoff]
);
await pool.end();

const recipients = rows.filter(r => r.email.toLowerCase() !== SKIP_EMAIL.toLowerCase());
console.log(`Found ${rows.length} commanders since ${cutoff}, sending to ${recipients.length} (skipping owner)\n`);

if (recipients.length === 0) {
  console.log('No recipients. Exiting.');
  process.exit(0);
}

if (dryRun) {
  console.log('=== DRY RUN — No emails will be sent ===\n');
  for (const r of recipients) {
    const created = new Date(r.createdAt).toISOString().slice(0, 10);
    console.log(`  📧 ${r.email} (${r.displayName || 'Commander'}) [${r.subscriptionTier}] joined ${created}`);
  }
  console.log(`\nSubject: ${SUBJECT}`);
  console.log(`From:    ${FROM}`);
  console.log(`\n--- Sample HTML (first recipient) ---`);
  console.log(buildWelcomeBackfillHtml(recipients[0]?.displayName || 'Commander').substring(0, 500) + '...');
  console.log(`\nTotal: ${recipients.length} recipients`);
  process.exit(0);
}

const resend = new Resend(process.env.RESEND_API_KEY);
let sent = 0;
let failed = 0;

for (let i = 0; i < recipients.length; i++) {
  const r = recipients[i];
  if (i > 0 && i % 4 === 0) await delay(1200);
  const html = buildWelcomeBackfillHtml(r.displayName || 'Commander');
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: r.email,
      subject: SUBJECT,
      html,
    });
    if (error) {
      console.error(`  ❌ ${r.email}: ${error.message}`);
      failed++;
    } else {
      console.log(`  ✅ ${r.email} (${r.displayName})`);
      sent++;
    }
  } catch (err) {
    console.error(`  ❌ ${r.email}: ${err.message}`);
    failed++;
  }
}

console.log(`\n=== DONE: ${sent} sent, ${failed} failed ===`);
