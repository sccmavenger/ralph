const BASE_URL = "https://themsftoolkit.com";
const DISCORD_INVITE = "https://discord.gg/2ptFQ2Vefk";
const CONTACT_EMAIL = "info@themsftoolkit.com";

export function buildWelcomeBackfillHtml(displayName) {
  const name = displayName || "Commander";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f0f23;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">

    <!-- Header -->
    <div style="text-align:center;padding:24px 0 20px;">
      <div style="display:inline-block;background:#dc2626;color:#fff;font-weight:800;padding:10px 16px;border-radius:8px;font-size:14px;letter-spacing:1px;">MSF</div>
      <h1 style="color:#4f9cf7;margin:16px 0 0;font-size:26px;">Welcome to MSF Companion, ${name}</h1>
    </div>

    <!-- Hero -->
    <div style="background:linear-gradient(135deg,#1a1a3e 0%,#2a1a4e 100%);border-radius:16px;padding:28px 24px;margin-bottom:24px;">
      <p style="color:#e0e0e0;font-size:15px;line-height:1.8;margin:0;">
        Hey ${name} — welcome aboard! You linked your Scopely account and now have a personal command center for your Marvel Strike Force roster.
      </p>
      <p style="color:#e0e0e0;font-size:15px;line-height:1.8;margin:16px 0 0;">
        We built MSF Companion because we wanted a better way to plan farming, prep for events, and actually <strong style="color:#4f9cf7;">understand</strong> our rosters. If you've ever stared at a wall of red dots in-game wondering "where do I start?", you're in the right place.
      </p>
    </div>

    <!-- What's free -->
    <div style="background:#1a1a2e;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="color:#f59e0b;font-size:16px;margin:0 0 16px;">🎮 What You Can Do Right Now (Free)</h2>
      <table style="width:100%;border-spacing:0 8px;">
        <tr><td style="color:#4f9cf7;font-size:14px;padding:0 8px 0 0;vertical-align:top;">📊</td><td style="color:#e0e0e0;font-size:14px;line-height:1.5;"><a href="${BASE_URL}/dashboard" style="color:#e0e0e0;text-decoration:underline;">Dashboard</a> — your daily command center with priorities & alerts</td></tr>
        <tr><td style="color:#4f9cf7;font-size:14px;padding:0 8px 0 0;vertical-align:top;">🦸</td><td style="color:#e0e0e0;font-size:14px;line-height:1.5;"><a href="${BASE_URL}/heroes" style="color:#e0e0e0;text-decoration:underline;">Heroes & Teams</a> — full roster view with filters that actually work</td></tr>
        <tr><td style="color:#4f9cf7;font-size:14px;padding:0 8px 0 0;vertical-align:top;">📅</td><td style="color:#e0e0e0;font-size:14px;line-height:1.5;"><a href="${BASE_URL}/analyze/farming-guide" style="color:#e0e0e0;text-decoration:underline;">Farming Guide</a> — node breakdowns and shard math</td></tr>
        <tr><td style="color:#4f9cf7;font-size:14px;padding:0 8px 0 0;vertical-align:top;">🏗️</td><td style="color:#e0e0e0;font-size:14px;line-height:1.5;"><a href="${BASE_URL}/analyze/tower-planner" style="color:#e0e0e0;text-decoration:underline;">Tower Planner</a> — track MIGHTY Tower cell-by-cell <strong style="color:#10b981;">(brand new!)</strong></td></tr>
        <tr><td style="color:#4f9cf7;font-size:14px;padding:0 8px 0 0;vertical-align:top;">📈</td><td style="color:#e0e0e0;font-size:14px;line-height:1.5;"><a href="${BASE_URL}/progress" style="color:#e0e0e0;text-decoration:underline;">Progress</a> — see what's moving and what's stuck</td></tr>
      </table>
    </div>

    <!-- Pro tip -->
    <div style="background:#1a1a2e;border-radius:12px;padding:20px 24px;margin-bottom:24px;border-left:3px solid #f59e0b;">
      <p style="color:#e0e0e0;font-size:14px;line-height:1.6;margin:0;">
        <strong style="color:#f59e0b;">Pro tip:</strong> Install MSF Companion as a PWA on your phone. Open the site in Safari/Chrome and tap "Add to Home Screen" — instant access, no app store needed.
      </p>
    </div>

    <!-- Discord -->
    <div style="background:linear-gradient(135deg,#5865F2 0%,#4752C4 100%);border-radius:12px;padding:24px;margin-bottom:24px;text-align:center;">
      <h2 style="color:#fff;font-size:16px;margin:0 0 8px;">💬 Come Hang Out on Discord</h2>
      <p style="color:#ddd;font-size:14px;line-height:1.6;margin:0 0 16px;">
        Real commanders, real talk. Share strategies, request features, report bugs, or just lurk. We're in there daily.
      </p>
      <a href="${DISCORD_INVITE}" style="display:inline-block;background:#fff;color:#5865F2;padding:12px 32px;border-radius:9999px;text-decoration:none;font-weight:700;font-size:14px;">Join the Discord →</a>
    </div>

    <!-- Dashboard CTA -->
    <div style="text-align:center;padding:8px 0 24px;">
      <a href="${BASE_URL}/dashboard" style="display:inline-block;background:#4f9cf7;color:#fff;padding:14px 36px;border-radius:9999px;text-decoration:none;font-weight:700;font-size:15px;">Open Your Dashboard →</a>
    </div>

    <!-- Closing -->
    <div style="text-align:center;padding:16px 0;border-top:1px solid #333;">
      <p style="color:#aaa;font-size:13px;line-height:1.7;margin:0 0 12px;">
        Questions, ideas, bugs, feature requests — we want all of it.<br/>
        Reach out anytime at <a href="mailto:${CONTACT_EMAIL}" style="color:#4f9cf7;text-decoration:none;">${CONTACT_EMAIL}</a> or on <a href="${DISCORD_INVITE}" style="color:#4f9cf7;text-decoration:none;">Discord</a>.
      </p>
      <p style="color:#666;font-size:12px;margin:0 0 8px;">
        MSF Companion — Your Marvel Strike Force Command Center
      </p>
      <p style="color:#555;font-size:11px;margin:0;">
        You're receiving this because you signed up at themsftoolkit.com. Don't want emails? <a href="${BASE_URL}/profile" style="color:#666;text-decoration:underline;">Manage preferences</a>.
      </p>
    </div>

  </div>
</body>
</html>`;
}
