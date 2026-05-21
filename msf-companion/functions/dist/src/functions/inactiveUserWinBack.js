"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const functions_1 = require("@azure/functions");
const pgClient_js_1 = require("../lib/pgClient.js");
function buildInactiveWinBackHtml(displayName, email) {
    const name = displayName || "Commander";
    const unsubscribeUrl = `https://themsftoolkit.com/api/email/unsubscribe?token=${encodeURIComponent(email)}`;
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f0f23;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;padding:24px 0 20px;">
      <div style="display:inline-block;background:#dc2626;color:#fff;font-weight:800;padding:10px 16px;border-radius:8px;font-size:14px;">MSF</div>
      <h1 style="color:#4f9cf7;margin:16px 0 0;font-size:24px;">We miss you, ${name}! 👋</h1>
    </div>
    <div style="background:#1a1a2e;border-radius:12px;padding:24px;margin-bottom:24px;">
      <p style="color:#e0e0e0;font-size:15px;line-height:1.7;margin:0 0 16px;">
        It's been a while since you last checked in. A lot has changed in MSF and we've been keeping up with all of it:
      </p>
      <ul style="color:#ccc;font-size:14px;line-height:2;margin:0;padding-left:20px;">
        <li>🆕 New characters and team compositions analyzed</li>
        <li>🤖 AI Advisor updated with the latest creator strategies</li>
        <li>📅 Fresh event guides and farming priorities</li>
        <li>📊 Meta shifts tracked across War and Crucible</li>
      </ul>
    </div>
    <div style="background:linear-gradient(135deg,#1a1a3e 0%,#2a1a4e 100%);border-radius:16px;padding:24px;text-align:center;margin-bottom:24px;">
      <p style="color:#e0e0e0;font-size:15px;line-height:1.7;margin:0;">
        Your roster data and progress are still here. Come back and see what's new — you still get <strong style="color:#4f9cf7;">3 free AI Advisor questions daily</strong>.
      </p>
    </div>
    <div style="text-align:center;padding:8px 0 24px;">
      <a href="https://themsftoolkit.com/dashboard" style="display:inline-block;background:#4f9cf7;color:#fff;padding:12px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px;">Return to Your Dashboard →</a>
    </div>
    <div style="text-align:center;padding:20px 0;border-top:1px solid #333;font-size:12px;color:#666;">
      <p style="margin:0;">MSF Companion — Your Marvel Strike Force Assistant</p>
      <a href="${unsubscribeUrl}" style="color:#888;text-decoration:underline;">Unsubscribe</a>
    </div>
  </div>
</body></html>`;
}
functions_1.app.timer("inactiveUserWinBack", {
    schedule: "0 0 10 * * *", // Daily at 10 AM UTC
    handler: async (_timer, context) => {
        context.log("Starting inactive free user win-back scan");
        const pool = (0, pgClient_js_1.getPool)();
        const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
        const EMAIL_FROM = process.env.EMAIL_FROM || "MSF Companion <info@msftoolkit.com>";
        if (!RESEND_API_KEY) {
            context.log("RESEND_API_KEY not configured — skipping");
            return;
        }
        // Find free users who:
        // - Have an email
        // - Haven't opted out
        // - Last logged in 30+ days ago
        // - Haven't already received this email (no win-back intervention in last 90 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const res = await pool.query(`
      SELECT c.id, c.email, c."displayName"
      FROM "Commander" c
      WHERE c."subscriptionTier" = 'FREE'
        AND c.email IS NOT NULL
        AND c."emailDigestOptOut" = false
        AND c.disabled = false
        AND c."lastLoginAt" IS NOT NULL
        AND c."lastLoginAt" < $1
        AND NOT EXISTS (
          SELECT 1 FROM "ChurnIntervention" ci
          WHERE ci."commanderId" = c.id
            AND ci.type = 'inactive-free-winback'
            AND ci."sentAt" > $2
        )
      LIMIT 50
    `, [thirtyDaysAgo, ninetyDaysAgo]);
        let sent = 0;
        for (const row of res.rows) {
            try {
                const html = buildInactiveWinBackHtml(row.displayName || "", row.email);
                const response = await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        from: EMAIL_FROM,
                        to: row.email,
                        subject: "We miss you, Commander! Here's what's new in MSF",
                        html,
                    }),
                });
                if (response.ok) {
                    // Log the intervention to prevent re-sending
                    await pool.query(`INSERT INTO "ChurnIntervention" (id, "commanderId", type, channel, "riskScore", "sentAt", delivered)
             VALUES (gen_random_uuid()::text, $1, 'inactive-free-winback', 'email', 0, NOW(), true)`, [row.id]);
                    sent++;
                }
                else {
                    const text = await response.text();
                    context.warn(`Win-back email failed for ${row.email}: ${response.status} ${text}`);
                }
            }
            catch (err) {
                context.warn(`Win-back email error for ${row.id}: ${err}`);
            }
        }
        context.log(`Inactive free user win-back: ${sent} emails sent out of ${res.rows.length} eligible`);
    },
});
//# sourceMappingURL=inactiveUserWinBack.js.map