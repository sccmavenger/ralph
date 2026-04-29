// Usage:
//   DRY RUN:  node scripts/send-community-email.mjs --dry-run
//   SEND:     node scripts/send-community-email.mjs --send
//
// Requires env vars: PROD_DATABASE_URL, RESEND_API_KEY

import pg from 'pg';
import { Resend } from 'resend';
import { buildCommunityEmailHtml } from './community-email-template.mjs';

const SKIP_EMAIL = 'dguilloryjr@msn.com'; // Owner — skip self
const SUBJECT = "You're Part of Something Big, Commander — Come Join Us";
const FROM = 'MSF Companion <info@themsftoolkit.com>';
const delay = ms => new Promise(r => setTimeout(r, ms));

const dryRun = process.argv.includes('--dry-run');
const doSend = process.argv.includes('--send');

if (!dryRun && !doSend) {
  console.error('Usage: node send-community-email.mjs --dry-run | --send');
  process.exit(1);
}

// 1. Get all customers with emails
const pool = new pg.Pool({ connectionString: process.env.PROD_DATABASE_URL });
const { rows } = await pool.query(`
  SELECT email, "displayName", "subscriptionTier"
  FROM "Commander"
  WHERE email IS NOT NULL AND email != '' AND disabled = false
  ORDER BY "createdAt"
`);
await pool.end();

const recipients = rows.filter(r => r.email.toLowerCase() !== SKIP_EMAIL.toLowerCase());
console.log(`Found ${rows.length} customers with emails, sending to ${recipients.length} (skipping owner)\n`);

if (dryRun) {
  console.log('=== DRY RUN — No emails will be sent ===\n');
  for (const r of recipients) {
    console.log(`  📧 ${r.email} (${r.displayName || 'Commander'}) [${r.subscriptionTier}]`);
  }
  console.log(`\nSubject: ${SUBJECT}`);
  console.log(`From: ${FROM}`);
  console.log(`\n--- Sample HTML (first recipient) ---`);
  console.log(buildCommunityEmailHtml(recipients[0]?.displayName || 'Commander').substring(0, 500) + '...');
  console.log(`\nTotal: ${recipients.length} recipients`);
  process.exit(0);
}

// 2. Send emails
const resend = new Resend(process.env.RESEND_API_KEY);
let sent = 0;
let failed = 0;

for (let i = 0; i < recipients.length; i++) {
  const r = recipients[i];
  if (i > 0 && i % 4 === 0) await delay(1200); // Resend rate limit: 5/sec
  const html = buildCommunityEmailHtml(r.displayName || 'Commander');
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
