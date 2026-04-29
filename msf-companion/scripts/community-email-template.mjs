const BASE_URL = "https://themsftoolkit.com";
const DISCORD_INVITE = "https://discord.gg/rFCn6fsk";
const CONTACT_EMAIL = "info@themsftoolkit.com";

export function buildCommunityEmailHtml(displayName) {
  const name = displayName || "Commander";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f0f23;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">

    <!-- Header -->
    <div style="text-align:center;padding:24px 0 20px;">
      <div style="display:inline-block;background:#dc2626;color:#fff;font-weight:800;padding:10px 16px;border-radius:8px;font-size:14px;letter-spacing:1px;">MSF</div>
      <h1 style="color:#4f9cf7;margin:16px 0 0;font-size:26px;">You're Part of Something Big, ${name}</h1>
    </div>

    <!-- Personal Greeting -->
    <div style="background:linear-gradient(135deg,#1a1a3e 0%,#2a1a4e 100%);border-radius:16px;padding:28px 24px;margin-bottom:24px;">
      <p style="color:#e0e0e0;font-size:15px;line-height:1.8;margin:0;">
        Hey ${name} — thank you for being one of our early MSF Companion users. Whether you signed up yesterday or have been here since day one, you're part of the crew that's helping shape this tool from the ground up.
      </p>
      <p style="color:#e0e0e0;font-size:15px;line-height:1.8;margin:16px 0 0;">
        We're not building MSF Companion in a vacuum — we're building it <strong style="color:#4f9cf7;">with you</strong>. Your feedback, your ideas, and your play style are what drive every feature we ship.
      </p>
    </div>

    <!-- Discord CTA (Primary) -->
    <div style="background:linear-gradient(135deg,#5865F2 0%,#4752C4 100%);border-radius:16px;padding:28px 24px;margin-bottom:24px;text-align:center;">
      <h2 style="color:#fff;font-size:20px;margin:0 0 12px;">💬 Come Be Part of the Conversation</h2>
      <p style="color:#ddd;font-size:14px;line-height:1.7;margin:0 0 8px;">
        We just launched our <strong>Discord community</strong> and we'd love for you to join. It's the place where you can:
      </p>
      <div style="text-align:left;display:inline-block;margin:12px 0 20px;">
        <p style="color:#fff;font-size:14px;margin:6px 0;">✅ Share feedback directly with the dev team</p>
        <p style="color:#fff;font-size:14px;margin:6px 0;">✅ Suggest features you actually want</p>
        <p style="color:#fff;font-size:14px;margin:6px 0;">✅ Get early access to new updates</p>
        <p style="color:#fff;font-size:14px;margin:6px 0;">✅ Chat with other MSF players</p>
        <p style="color:#fff;font-size:14px;margin:6px 0;">✅ Help us figure out what to build next</p>
      </div>
      <br/>
      <a href="${DISCORD_INVITE}" style="display:inline-block;background:#fff;color:#5865F2;padding:14px 36px;border-radius:9999px;text-decoration:none;font-weight:700;font-size:15px;">Join Our Discord →</a>
    </div>

    <!-- What's Coming -->
    <div style="background:#1a1a2e;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="color:#f59e0b;font-size:16px;margin:0 0 14px;">🔮 What's Coming Next</h2>
      <p style="color:#e0e0e0;font-size:14px;line-height:1.7;margin:0;">
        We've got big plans — a smarter AI Advisor, weekly email digests, deeper roster analytics, improved team building tools, and more. But here's the thing: <strong style="color:#4f9cf7;">Discord members hear about it first</strong>, and your input directly shapes what gets built.
      </p>
      <p style="color:#e0e0e0;font-size:14px;line-height:1.7;margin:12px 0 0;">
        We genuinely want to know what would make MSF Companion more valuable for <em>you</em>. Drop into Discord and tell us — we're listening.
      </p>
    </div>

    <!-- Secondary CTA -->
    <div style="text-align:center;padding:8px 0 24px;">
      <a href="${BASE_URL}/dashboard" style="display:inline-block;background:#4f9cf7;color:#fff;padding:14px 36px;border-radius:9999px;text-decoration:none;font-weight:700;font-size:15px;">Visit Your Dashboard →</a>
    </div>

    <!-- Closing -->
    <div style="text-align:center;padding:16px 0;border-top:1px solid #333;">
      <p style="color:#aaa;font-size:13px;line-height:1.7;margin:0 0 12px;">
        Thanks for being here, Commander. We're building something great — and it's better with you in it.
      </p>
      <p style="color:#888;font-size:12px;margin:0 0 8px;">
        Questions or ideas? Reply to this email or reach us at <a href="mailto:${CONTACT_EMAIL}" style="color:#4f9cf7;text-decoration:none;">${CONTACT_EMAIL}</a>
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
