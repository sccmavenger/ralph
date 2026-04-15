import pg from "pg";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

async function main() {
  // Find premium commanders
  const { rows: commanders } = await pool.query(
    `SELECT id, "displayName" FROM "Commander" WHERE disabled = false AND "subscriptionTier" = 'PREMIUM'`
  );

  console.log("Premium commanders found:", commanders.length);

  if (commanders.length === 0) {
    console.log("No premium commanders to notify.");
    return;
  }

  const title = "� Discord Link Updated!";
  const message =
    "Heads up, Commander! Our Discord invite link has been updated. If you tried joining before and it didn't work — sorry about that! Here's the new link. Come chat with the dev team, share feedback, and help shape what we build next!";
  const linkUrl = "https://discord.gg/yyTq7KfX";
  const type = "announcement";

  // Build bulk insert
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let idx = 1;
  for (const c of commanders) {
    placeholders.push(
      `(gen_random_uuid(), $${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, false, NOW())`
    );
    values.push(c.id, type, title, message, linkUrl);
    idx += 5;
  }

  await pool.query(
    `INSERT INTO "CommanderNotification" (id, "commanderId", type, title, message, "linkUrl", read, "createdAt")
     VALUES ${placeholders.join(", ")}`,
    values
  );

  console.log("Notifications sent:", commanders.length);
  for (const c of commanders) {
    console.log("  ->", c.displayName ?? c.id);
  }
}

main()
  .catch(console.error)
  .finally(() => pool.end());
