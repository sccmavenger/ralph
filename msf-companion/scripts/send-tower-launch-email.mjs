// Tower Planner launch announcement — sends to ALL active commanders who haven't opted out.
//
// Usage:
//   DRY RUN:  node scripts/send-tower-launch-email.mjs --dry-run
//   SEND:     node scripts/send-tower-launch-email.mjs --send
//
// Requires env vars: PROD_DATABASE_URL, RESEND_API_KEY

import pg from 'pg';
import { Resend } from 'resend';
import { buildTowerLaunchHtml } from './tower-launch-email-template.mjs';

const SKIP_EMAIL = 'dguilloryjr@msn.com';
const SUBJECT = "New: Live MIGHTY Tower Planner — see your cleared cells, auto-updated";
const FROM = 'MSF Companion <info@themsftoolkit.com>';

const delay = ms => new Promise(r => setTimeout(r, ms));

const dryRun = process.argv.includes('--dry-run');
const doSend = process.argv.includes('--send');

if (!dryRun && !doSend) {
  console.error('Usage: node send-tower-launch-email.mjs --dry-run | --send');
  process.exit(1);
}

if (!process.env.PROD_DATABASE_URL) {
  console.error('Missing PROD_DATABASE_URL env var.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.PROD_DATABASE_URL });
const { rows } = await pool.query(`
  SELECT email, "displayName", "subscriptionTier"
  FROM "Commander"
  WHERE email IS NOT NULL
    AND email != ''
    AND disabled = false
    AND "emailDigestOptOut" = false
  ORDER BY "createdAt"
`);
await pool.end();

const recipients = rows.filter(r => r.email.toLowerCase() !== SKIP_EMAIL.toLowerCase());
console.log(`Found ${rows.length} active commanders, sending to ${recipients.length} (skipping owner)\n`);

if (recipients.length === 0) {
  console.log('No recipients. Exiting.');
  process.exit(0);
}

if (dryRun) {
  console.log('=== DRY RUN — No emails will be sent ===\n');
  for (const r of recipients) {
    console.log(`  📧 ${r.email} (${r.displayName || 'Commander'}) [${r.subscriptionTier}]`);
  }
  console.log(`\nSubject: ${SUBJECT}`);
  console.log(`From:    ${FROM}`);
  console.log(`\n--- Sample HTML (first recipient) ---`);
  console.log(buildTowerLaunchHtml(recipients[0]?.displayName || 'Commander').substring(0, 500) + '...');
  console.log(`\nTotal: ${recipients.length} recipients`);
  process.exit(0);
}

const resend = new Resend(process.env.RESEND_API_KEY);
let sent = 0;
let failed = 0;

for (let i = 0; i < recipients.length; i++) {
  const r = recipients[i];
  if (i > 0 && i % 4 === 0) await delay(1200);
  const html = buildTowerLaunchHtml(r.displayName || 'Commander');
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
