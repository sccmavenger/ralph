import pg from "pg";

const DISCORD_INVITE = "https://discord.gg/rFCn6fsk";
const BASE_URL = "https://themsftoolkit.com";
const CONTACT_EMAIL = "info@themsftoolkit.com";
const FROM = "MSF Companion <info@themsftoolkit.com>";
const SUBJECT = "Oops — Here's the Correct Discord Link, Commander";
const OWNER_EMAIL = "dguilloryjr@msn.com";

function buildApologyHtml(displayName) {
  const name = displayName || "Commander";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f0f23;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">

    <!-- Header -->
    <div style="text-align:center;padding:24px 0 20px;">
      <div style="display:inline-block;background:#dc2626;color:#fff;font-weight:800;padding:10px 16px;border-radius:8px;font-size:14px;letter-spacing:1px;">MSF</div>
      <h1 style="color:#f59e0b;margin:16px 0 0;font-size:24px;">Quick Fix, ${name}</h1>
    </div>

    <!-- Apology -->
    <div style="background:linear-gradient(135deg,#1a1a3e 0%,#2a1a4e 100%);border-radius:16px;padding:28px 24px;margin-bottom:24px;">
      <p style="color:#e0e0e0;font-size:15px;line-height:1.8;margin:0;">
        Hey ${name} — we sent you an invite to our new Discord community earlier today, but the link in that email was wrong. That's on us — sorry about that!
      </p>
      <p style="color:#e0e0e0;font-size:15px;line-height:1.8;margin:16px 0 0;">
        Here's the <strong style="color:#4f9cf7;">correct link</strong> to join our Discord:
      </p>
    </div>

    <!-- Discord CTA -->
    <div style="background:linear-gradient(135deg,#5865F2 0%,#4752C4 100%);border-radius:16px;padding:28px 24px;margin-bottom:24px;text-align:center;">
      <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">💬 Join the MSF Companion Discord</h2>
      <div style="text-align:left;display:inline-block;margin:0 0 20px;">
        <p style="color:#fff;font-size:14px;margin:6px 0;">✅ Share feedback directly with the dev team</p>
        <p style="color:#fff;font-size:14px;margin:6px 0;">✅ Suggest features you actually want</p>
        <p style="color:#fff;font-size:14px;margin:6px 0;">✅ Get early access to new updates</p>
        <p style="color:#fff;font-size:14px;margin:6px 0;">✅ Chat with other MSF players</p>
      </div>
      <br/>
      <a href="${DISCORD_INVITE}" style="display:inline-block;background:#fff;color:#5865F2;padding:14px 36px;border-radius:9999px;text-decoration:none;font-weight:700;font-size:15px;">Join Our Discord →</a>
    </div>

    <!-- Closing -->
    <div style="text-align:center;padding:16px 0;border-top:1px solid #333;">
      <p style="color:#aaa;font-size:13px;line-height:1.7;margin:0 0 12px;">
        Again, sorry for the mix-up. We're excited to see you in there, Commander.
      </p>
      <p style="color:#888;font-size:12px;margin:0 0 8px;">
        Questions? Reply to this email or reach us at <a href="mailto:${CONTACT_EMAIL}" style="color:#4f9cf7;text-decoration:none;">${CONTACT_EMAIL}</a>
      </p>
      <p style="color:#666;font-size:11px;margin:16px 0 0;">
        MSF Companion — Your Marvel Strike Force Command Center<br/>
        You're receiving this because you signed up at <a href="${BASE_URL}" style="color:#666;text-decoration:underline;">themsftoolkit.com</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const mode = process.argv[2];
  if (!["--dry-run", "--send"].includes(mode)) {
    console.log("Usage: node send-apology-email.mjs [--dry-run | --send]");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.PROD_DATABASE_URL });
  const { rows } = await pool.query(`
    SELECT email, "displayName"
    FROM "Commander"
    WHERE email IS NOT NULL AND email != '' AND disabled = false
    ORDER BY "createdAt"
  `);
  await pool.end();

  const recipients = rows.filter(
    (r) => r.email.toLowerCase() !== OWNER_EMAIL.toLowerCase()
  );
  console.log(
    `Found ${rows.length} customers with emails, sending to ${recipients.length} (skipping owner)`
  );

  if (mode === "--dry-run") {
    for (const r of recipients) console.log(`  [DRY] ${r.email} (${r.displayName || "no-name"})`);
    console.log("\nDry run complete. Use --send to actually send.");
    return;
  }

  let sent = 0, failed = 0;
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    if (i > 0 && i % 4 === 0) await delay(1200);
    const html = buildApologyHtml(r.displayName || "Commander");
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: FROM, to: r.email, subject: SUBJECT, html }),
      });
      const data = await res.json();
      if (res.ok) {
        sent++;
        console.log(`  ✅ ${r.email} (${r.displayName})`);
      } else {
        failed++;
        console.log(`  ❌ ${r.email}: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      failed++;
      console.log(`  ❌ ${r.email}: ${err.message}`);
    }
  }
  console.log(`\n=== DONE: ${sent} sent, ${failed} failed ===`);
}

main().catch(console.error);
