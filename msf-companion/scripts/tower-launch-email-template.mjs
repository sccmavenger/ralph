const BASE_URL = "https://themsftoolkit.com";
const DISCORD_INVITE = "https://discord.gg/2ptFQ2Vefk";
const CONTACT_EMAIL = "info@themsftoolkit.com";
const TOWER_URL = `${BASE_URL}/analyze/tower-planner`;

export function buildTowerLaunchHtml(displayName) {
  const name = displayName || "Commander";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f0f23;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">

    <!-- Header -->
    <div style="text-align:center;padding:24px 0 20px;">
      <div style="display:inline-block;background:#dc2626;color:#fff;font-weight:800;padding:10px 16px;border-radius:8px;font-size:14px;letter-spacing:1px;">MSF</div>
      <h1 style="color:#4f9cf7;margin:16px 0 0;font-size:26px;">New: MIGHTY Tower Planner 🏗️</h1>
      <p style="color:#aaa;font-size:14px;margin:8px 0 0;">Live today on MSF Companion</p>
    </div>

    <!-- Hero -->
    <div style="background:linear-gradient(135deg,#1a1a3e 0%,#2a1a4e 100%);border-radius:16px;padding:28px 24px;margin-bottom:24px;">
      <p style="color:#e0e0e0;font-size:15px;line-height:1.8;margin:0;">
        Hey ${name} — Tower week is brutal. Tracking which cells you've cleared, which one is next, and how much time you have left is a full job on its own.
      </p>
      <p style="color:#e0e0e0;font-size:15px;line-height:1.8;margin:16px 0 0;">
        So we built the <strong style="color:#4f9cf7;">MIGHTY Tower Planner</strong> — and it just went live.
      </p>
    </div>

    <!-- What's new -->
    <div style="background:#1a1a2e;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="color:#f59e0b;font-size:16px;margin:0 0 16px;">⚡ What's Inside</h2>
      <table style="width:100%;border-spacing:0 8px;">
        <tr><td style="color:#4f9cf7;font-size:14px;padding:0 8px 0 0;vertical-align:top;">✅</td><td style="color:#e0e0e0;font-size:14px;line-height:1.5;"><strong>Auto-detected progress</strong> — we pull your cleared cells straight from in-game state. No manual checkboxes.</td></tr>
        <tr><td style="color:#4f9cf7;font-size:14px;padding:0 8px 0 0;vertical-align:top;">🌪️</td><td style="color:#e0e0e0;font-size:14px;line-height:1.5;"><strong>STORM &amp; OMEGA tabs</strong> — switch between variants with one tap, each one tracked independently.</td></tr>
        <tr><td style="color:#4f9cf7;font-size:14px;padding:0 8px 0 0;vertical-align:top;">🧭</td><td style="color:#e0e0e0;font-size:14px;line-height:1.5;"><strong>Linear cell view</strong> — A1 → A2 → A3 → B1… see exactly where you are in the climb.</td></tr>
        <tr><td style="color:#4f9cf7;font-size:14px;padding:0 8px 0 0;vertical-align:top;">⏱️</td><td style="color:#e0e0e0;font-size:14px;line-height:1.5;"><strong>Time remaining banner</strong> — know how much runway you have before the tower closes.</td></tr>
        <tr><td style="color:#4f9cf7;font-size:14px;padding:0 8px 0 0;vertical-align:top;">📱</td><td style="color:#e0e0e0;font-size:14px;line-height:1.5;"><strong>Mobile-first</strong> — built for phone-in-one-hand tower runs.</td></tr>
      </table>
    </div>

    <!-- Primary CTA -->
    <div style="text-align:center;padding:8px 0 24px;">
      <a href="${TOWER_URL}" style="display:inline-block;background:#dc2626;color:#fff;padding:14px 36px;border-radius:9999px;text-decoration:none;font-weight:700;font-size:15px;">Open the Tower Planner →</a>
    </div>

    <!-- Why -->
    <div style="background:#1a1a2e;border-radius:12px;padding:20px 24px;margin-bottom:24px;border-left:3px solid #10b981;">
      <p style="color:#e0e0e0;font-size:14px;line-height:1.6;margin:0;">
        <strong style="color:#10b981;">Why we built this:</strong> Tower is one of the highest-friction events in the game. Most of us were tracking progress in our heads (or notes apps). Now it's just there, always synced, always current.
      </p>
    </div>

    <!-- Discord -->
    <div style="background:linear-gradient(135deg,#5865F2 0%,#4752C4 100%);border-radius:12px;padding:24px;margin-bottom:24px;text-align:center;">
      <h2 style="color:#fff;font-size:16px;margin:0 0 8px;">💬 Tell Us What You Think</h2>
      <p style="color:#ddd;font-size:14px;line-height:1.6;margin:0 0 16px;">
        Try it during your next tower run and let us know what's working (and what isn't). The #feedback channel on Discord is the fastest way to reach us.
      </p>
      <a href="${DISCORD_INVITE}" style="display:inline-block;background:#fff;color:#5865F2;padding:12px 32px;border-radius:9999px;text-decoration:none;font-weight:700;font-size:14px;">Join the Discord →</a>
    </div>

    <!-- Closing -->
    <div style="text-align:center;padding:16px 0;border-top:1px solid #333;">
      <p style="color:#aaa;font-size:13px;line-height:1.7;margin:0 0 12px;">
        Good luck in the tower, ${name}. 🚀<br/>
        Reach out anytime at <a href="mailto:${CONTACT_EMAIL}" style="color:#4f9cf7;text-decoration:none;">${CONTACT_EMAIL}</a>.
      </p>
      <p style="color:#666;font-size:12px;margin:0 0 8px;">
        MSF Companion — Your Marvel Strike Force Command Center
      </p>
      <p style="color:#555;font-size:11px;margin:0;">
        Don't want product update emails? <a href="${BASE_URL}/profile" style="color:#666;text-decoration:underline;">Manage preferences</a>.
      </p>
    </div>

  </div>
</body>
</html>`;
}
