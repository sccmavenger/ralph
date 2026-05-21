// Insert in-app "MIGHTY Tower Planner" launch notification for all active commanders.
// Idempotent — skips commanders who already have a notification with
// metadata.feature = 'tower-planner'.
//
// Usage:
//   DRY RUN:  node scripts/insert-tower-launch-notification.mjs --dry-run
//   SEND:     node scripts/insert-tower-launch-notification.mjs --send
//
// Requires env var: PROD_DATABASE_URL

import pg from 'pg';

const TYPE = 'feature_launch';
const TITLE = 'New: MIGHTY Tower Planner';
const MESSAGE =
  'Track STORM & OMEGA cell-by-cell. Auto-detects your cleared cells from in-game progress.';
const LINK_URL = '/analyze/tower-planner';
const FEATURE_KEY = 'tower-planner';
const LAUNCHED_AT = '2026-05-21';

const dryRun = process.argv.includes('--dry-run');
const doSend = process.argv.includes('--send');

if (!dryRun && !doSend) {
  console.error('Usage: node insert-tower-launch-notification.mjs --dry-run | --send');
  process.exit(1);
}

if (!process.env.PROD_DATABASE_URL) {
  console.error('Missing PROD_DATABASE_URL env var.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.PROD_DATABASE_URL });

try {
  // Find active commanders who do NOT already have this feature notification.
  const { rows: commanders } = await pool.query(
    `
    SELECT c.id, c."displayName"
    FROM "Commander" c
    WHERE c.disabled = false
      AND NOT EXISTS (
        SELECT 1 FROM "CommanderNotification" n
        WHERE n."commanderId" = c.id
          AND n.type = $1
          AND n.metadata->>'feature' = $2
      )
    ORDER BY c."createdAt"
    `,
    [TYPE, FEATURE_KEY]
  );

  console.log(`Active commanders missing this notification: ${commanders.length}\n`);

  if (commanders.length === 0) {
    console.log('Nothing to insert. Exiting.');
    process.exit(0);
  }

  if (dryRun) {
    console.log('=== DRY RUN — No notifications will be inserted ===\n');
    console.log(`Type:    ${TYPE}`);
    console.log(`Title:   ${TITLE}`);
    console.log(`Message: ${MESSAGE}`);
    console.log(`Link:    ${LINK_URL}`);
    console.log(`Metadata: { feature: "${FEATURE_KEY}", launchedAt: "${LAUNCHED_AT}" }\n`);
    const preview = commanders.slice(0, 10);
    for (const c of preview) {
      console.log(`  🔔 ${c.displayName || c.id}`);
    }
    if (commanders.length > preview.length) {
      console.log(`  ... and ${commanders.length - preview.length} more`);
    }
    console.log(`\nTotal: ${commanders.length} commanders would receive this notification.`);
    process.exit(0);
  }

  // Bulk insert
  const values = [];
  const placeholders = [];
  let idx = 1;
  const metadataJson = JSON.stringify({ feature: FEATURE_KEY, launchedAt: LAUNCHED_AT });

  for (const c of commanders) {
    placeholders.push(
      `(gen_random_uuid()::text, $${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}::jsonb, false, NOW())`
    );
    values.push(c.id, TYPE, TITLE, MESSAGE, LINK_URL, metadataJson);
    idx += 6;
  }

  const result = await pool.query(
    `INSERT INTO "CommanderNotification" (id, "commanderId", type, title, message, "linkUrl", metadata, read, "createdAt")
     VALUES ${placeholders.join(', ')}`,
    values
  );

  console.log(`✅ Inserted ${result.rowCount} notifications.`);
} finally {
  await pool.end();
}
