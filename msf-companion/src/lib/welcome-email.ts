const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://themsftoolkit.com";
const DISCORD_INVITE = "https://discord.gg/yyTq7KfX";
const FAQ_URL = `${BASE_URL}/faq`;
const CONTACT_EMAIL = "info@themsftoolkit.com";

export function buildWelcomeEmailHtml(displayName: string): string {
  const name = displayName || "Commander";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f0f23;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">

    <!-- Header -->
    <div style="text-align:center;padding:24px 0 20px;">
      <div style="display:inline-block;background:#dc2626;color:#fff;font-weight:800;padding:10px 16px;border-radius:8px;font-size:14px;letter-spacing:1px;">MSF</div>
      <h1 style="color:#4f9cf7;margin:16px 0 0;font-size:28px;">Welcome to Premium, ${name}! 🎉</h1>
    </div>

    <!-- Hero Section -->
    <div style="background:linear-gradient(135deg,#1a1a3e 0%,#2a1a4e 100%);border-radius:16px;padding:28px 24px;text-align:center;margin-bottom:24px;">
      <p style="color:#e0e0e0;font-size:16px;line-height:1.7;margin:0;">
        You just leveled up, Commander! 🚀 Your Premium access is now <strong style="color:#4f9cf7;">fully active</strong> and ready to give you the strategic edge you deserve.
      </p>
    </div>

    <!-- What You Unlocked -->
    <div style="background:#1a1a2e;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="color:#f59e0b;font-size:16px;margin:0 0 16px;">⚡ What You Just Unlocked</h2>
      <table style="width:100%;border-spacing:0 8px;">
        <tr><td style="color:#4f9cf7;font-size:14px;padding:0 8px 0 0;vertical-align:top;">🤖</td><td style="color:#e0e0e0;font-size:14px;line-height:1.5;">Unlimited AI Advisor — personalized strategy from top creators</td></tr>
        <tr><td style="color:#4f9cf7;font-size:14px;padding:0 8px 0 0;vertical-align:top;">🗓️</td><td style="color:#e0e0e0;font-size:14px;line-height:1.5;">Planner — event prep, farming goals &amp; daily priorities</td></tr>
        <tr><td style="color:#4f9cf7;font-size:14px;padding:0 8px 0 0;vertical-align:top;">🏆</td><td style="color:#e0e0e0;font-size:14px;line-height:1.5;">Team Builder — synergy scores &amp; meta comparisons</td></tr>
        <tr><td style="color:#4f9cf7;font-size:14px;padding:0 8px 0 0;vertical-align:top;">📊</td><td style="color:#e0e0e0;font-size:14px;line-height:1.5;">Deep Roster Analytics — unlock hidden potential</td></tr>
        <tr><td style="color:#4f9cf7;font-size:14px;padding:0 8px 0 0;vertical-align:top;">🎯</td><td style="color:#e0e0e0;font-size:14px;line-height:1.5;">Dark Dimension Planner — conquer every node</td></tr>
        <tr><td style="color:#4f9cf7;font-size:14px;padding:0 8px 0 0;vertical-align:top;">📦</td><td style="color:#e0e0e0;font-size:14px;line-height:1.5;">Full Inventory tracking with search</td></tr>
        <tr><td style="color:#4f9cf7;font-size:14px;padding:0 8px 0 0;vertical-align:top;">🔮</td><td style="color:#e0e0e0;font-size:14px;line-height:1.5;">Every future Premium feature — automatically yours</td></tr>
      </table>
    </div>

    <!-- Thank You -->
    <div style="background:#1a1a2e;border-radius:12px;padding:24px;margin-bottom:24px;text-align:center;">
      <h2 style="color:#10b981;font-size:16px;margin:0 0 12px;">🙏 Thank You</h2>
      <p style="color:#e0e0e0;font-size:14px;line-height:1.7;margin:0;">
        Seriously — thank you for supporting MSF Companion. Your subscription helps us keep building new tools and improving the ones you love. Every Premium member fuels the mission to make the best MSF resource out there.
      </p>
    </div>

    <!-- Discord CTA -->
    <div style="background:linear-gradient(135deg,#5865F2 0%,#4752C4 100%);border-radius:12px;padding:24px;margin-bottom:24px;text-align:center;">
      <h2 style="color:#fff;font-size:16px;margin:0 0 8px;">💬 Join Us on Discord</h2>
      <p style="color:#ddd;font-size:14px;line-height:1.6;margin:0 0 16px;">
        Chat live with the developers, share feedback, ask questions, suggest features, and hang out with the community. We're always listening and love hearing from our commanders!
      </p>
      <a href="${DISCORD_INVITE}" style="display:inline-block;background:#fff;color:#5865F2;padding:12px 32px;border-radius:9999px;text-decoration:none;font-weight:700;font-size:14px;">Join the Discord →</a>
    </div>

    <!-- Dashboard CTA -->
    <div style="text-align:center;padding:8px 0 24px;">
      <a href="${BASE_URL}/dashboard" style="display:inline-block;background:#4f9cf7;color:#fff;padding:14px 36px;border-radius:9999px;text-decoration:none;font-weight:700;font-size:15px;">Go to Your Dashboard →</a>
    </div>

    <!-- Helpful Links -->
    <div style="background:#1a1a2e;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
      <h3 style="color:#e0e0e0;font-size:14px;margin:0 0 12px;">📌 Helpful Links</h3>
      <p style="margin:6px 0;font-size:13px;"><a href="${FAQ_URL}" style="color:#4f9cf7;text-decoration:none;">📖 Frequently Asked Questions</a></p>
      <p style="margin:6px 0;font-size:13px;"><a href="${BASE_URL}/advisor" style="color:#4f9cf7;text-decoration:none;">🤖 AI Roster Advisor</a></p>
      <p style="margin:6px 0;font-size:13px;"><a href="${DISCORD_INVITE}" style="color:#4f9cf7;text-decoration:none;">💬 Discord Community</a></p>
      <p style="margin:6px 0;font-size:13px;"><a href="mailto:${CONTACT_EMAIL}" style="color:#4f9cf7;text-decoration:none;">✉️ Email Us</a></p>
    </div>

    <!-- Closing -->
    <div style="text-align:center;padding:16px 0;border-top:1px solid #333;">
      <p style="color:#aaa;font-size:13px;line-height:1.7;margin:0 0 12px;">
        Have questions, concerns, ideas, or just want to say hi?<br/>
        We'd love to hear from you — reach out anytime at <a href="mailto:${CONTACT_EMAIL}" style="color:#4f9cf7;text-decoration:none;">${CONTACT_EMAIL}</a>
      </p>
      <p style="color:#666;font-size:12px;margin:0;">
        MSF Companion — Your Marvel Strike Force Command Center
      </p>
    </div>

  </div>
</body>
</html>`;
}
