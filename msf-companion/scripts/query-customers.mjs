import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.PROD_DATABASE_URL });

try {
  const { rows } = await pool.query(`
    SELECT email, "displayName", "subscriptionTier", "createdAt", "lastLoginAt"
    FROM "Commander"
    WHERE email IS NOT NULL AND email != '' AND disabled = false
    ORDER BY "createdAt"
  `);
  console.log(JSON.stringify(rows, null, 2));
  console.log(`\nTotal: ${rows.length} customers with emails`);
} catch(e) {
  console.error(e);
} finally {
  await pool.end();
}
