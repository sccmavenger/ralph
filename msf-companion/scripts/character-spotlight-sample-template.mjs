const BASE_URL = "https://themsftoolkit.com";
const FONT = "Arial,Helvetica,sans-serif";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// MSF descriptions contain game rich-text tags, not email-safe HTML. Keep all
// wording and line breaks; never allow upstream markup to become active HTML.
function descriptionText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<p(?:\s[^>]*)?>/gi, "")
    .replace(/<\/?(?:color|size|b|i|u)(?:=[^>]*)?\s*>/gi, "")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function descriptionHtml(value) {
  return descriptionText(value)
    .split(/\n\n+/)
    .map((paragraph) => `<p style="margin:0 0 12px;color:#dce6f2;font-size:15px;line-height:1.65;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function imageUrl(value, imageSource) {
  if (!value) return "";
  const transformed = String(imageSource(String(value)) ?? "");
  if (/^cid:[a-zA-Z0-9._@-]+$/.test(transformed)) return escapeHtml(transformed);
  // The isolated preview generator stores only verified image assets here.
  if (/^assets\/[a-zA-Z0-9_-]+\.(?:png|jpe?g)$/.test(transformed)) return escapeHtml(transformed);
  try {
    const parsed = new URL(transformed);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password) {
      return escapeHtml(parsed.href);
    }
  } catch {
    // Unusable images are omitted; the readable text is never dependent on art.
  }
  return "";
}

function levelLabel(level) {
  return Number.isInteger(level) && level > 0
    ? `Highest available level ${level}`
    : "Ability level not provided";
}

function fetchedLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Official game data"
    : `Official game data retrieved ${date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}`;
}

function replayDetails(character) {
  if (!character.originalAlert) return null;
  const date = new Date(character.originalAlert.sentAt);
  const sentAt = Number.isNaN(date.getTime())
    ? "your earlier alert"
    : `your alert sent ${date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}`;
  return {
    intro: `At your request, this is ${character.name} from ${sentAt}, presented in the Option 1 design. Ability wording is preserved from that alert; artwork was retrieved again from the official game data.`,
    subject: character.originalAlert.subject || "",
  };
}

function isSummon(character) {
  return (character.traits ?? []).some((trait) =>
    [trait.id, trait.name].some((value) => String(value ?? "").toLowerCase() === "summon")
  );
}

function abilityCard(ability, imageSource, replay = false) {
  const icon = imageUrl(ability.icon, imageSource);
  return `<tr><td style="padding:0 0 14px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:separate;background:#111f33;border:1px solid #293d55;border-radius:14px;">
      <tr><td style="padding:20px 18px 6px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
          <tr>${icon ? `<td width="58" valign="top" style="width:58px;padding:2px 10px 0 0;"><img src="${icon}" width="48" height="48" alt="${escapeHtml(ability.name)} ability icon" style="display:block;width:48px;height:48px;border:0;border-radius:10px;"></td>` : ""}
            <td valign="top" style="overflow-wrap:anywhere;word-break:break-word;">
              <p style="margin:0 0 5px;color:#63dbea;font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;">${escapeHtml(ability.type)}</p>
              <h3 style="margin:0 0 5px;color:#ffffff;font-size:19px;line-height:1.3;">${escapeHtml(ability.name)}</h3>
              <p style="margin:0;color:#a7b7ca;font-size:12px;line-height:1.5;">${escapeHtml(replay ? "From your original alert" : levelLabel(ability.level))}</p>
            </td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:12px 18px 8px;">${descriptionHtml(ability.description)}</td></tr>
    </table>
  </td></tr>`;
}

/** Presentation only: this module never selects recipients or sends email. */
export function buildSpotlightSampleHtml(character, { imageSource = (url) => url } = {}) {
  const replay = replayDetails(character);
  const summon = isSummon(character);
  const name = escapeHtml(character.name);
  const portrait = imageUrl(character.portrait, imageSource);
  const art = imageUrl(character.costume?.fullArt, imageSource);
  const costumeName = escapeHtml(character.costume?.name || "Costume not specified");
  const traits = (character.traits ?? []).map((trait) =>
    `<span style="display:inline-block;margin:0 5px 7px 0;padding:6px 9px;background:#142c40;border:1px solid #31516a;border-radius:6px;color:#c4eef2;font-size:12px;line-height:1.3;">${escapeHtml(trait.name || trait.id)}</span>`
  ).join("");
  const abilities = (character.abilities ?? []).map((ability) => abilityCard(ability, imageSource, Boolean(replay))).join("");
  const portraitSize = art ? 64 : 144;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <title>${replay ? "Requested resend" : "Sample"} · ${name} Character Spotlight</title>
</head>
<body style="margin:0;padding:0;background:#07111e;color:#ffffff;font-family:${FONT};-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;color:#07111e;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${replay ? `Your requested resend: ${name}, with the original alert's ability wording and refreshed official artwork in the Option 1 design.` : `Your requested Option 1 preview: ${name}, official character art, and the complete normal ability kit. Design sample — not a new release alert.`}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#07111e" style="width:100%;background:#07111e;border-collapse:collapse;">
    <tr><td align="center" style="padding:24px 10px 32px;">
      <!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;">
        <tr><td style="padding:0 10px 22px;">
          <p style="margin:0 0 10px;color:#ffffff;font-size:16px;font-weight:bold;letter-spacing:2px;">THE MSF TOOLKIT</p>
          <p style="margin:0;color:#f3c768;font-size:11px;font-weight:bold;letter-spacing:1.8px;">${replay ? "REQUESTED RESEND" : "SAMPLE"} &middot; OPTION 1</p>
        </td></tr>
        <tr><td style="padding:0 0 20px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#0d1d30;border:1px solid #2a4860;border-top:3px solid #63dbea;border-radius:16px;border-collapse:separate;">
            <tr><td align="center" style="padding:28px 18px 12px;">
              <p style="margin:0 0 14px;color:#63dbea;font-size:12px;font-weight:bold;letter-spacing:2.5px;">CHARACTER SPOTLIGHT</p>
              ${portrait ? `<img src="${portrait}" width="${portraitSize}" height="${portraitSize}" alt="${name} portrait" style="display:block;width:${portraitSize}px;height:${portraitSize}px;margin:0 auto 12px;border:1px solid #31516a;border-radius:50%;">` : ""}
              <h1 style="margin:0 0 10px;color:#ffffff;font-size:34px;line-height:1.15;overflow-wrap:anywhere;word-break:break-word;">${name}</h1>
              <p style="margin:0;color:#b9cadb;font-size:15px;line-height:1.6;">${summon ? "Meet the summoned unit.<br>Understand its abilities." : "Meet the character. Understand the kit.<br>Plan your next investment."}</p>
            </td></tr>
            ${art ? `<tr><td align="center" style="padding:10px 18px 0;"><img src="${art}" width="280" alt="Official ${name} full-body artwork in the ${costumeName} costume" style="display:block;width:100%;max-width:280px;height:auto;border:0;border-radius:10px;margin:0 auto;"></td></tr>
            <tr><td align="center" style="padding:12px 18px 18px;"><p style="margin:0;color:#a7b7ca;font-size:12px;line-height:1.6;">Official costume artwork: <strong style="color:#d8e3ef;">${costumeName}</strong><br>${replay ? "Artwork refreshed from the official game data for this resend." : "Costume art is shown for this design preview."}</p></td></tr>` : `<tr><td align="center" style="padding:10px 18px 18px;"><p style="margin:0;color:#a7b7ca;font-size:12px;line-height:1.6;">${portrait ? "Full-body artwork is not available in the official game data; showing the official portrait." : "Full-body artwork and a portrait are not available in the retrieved official game data."}</p></td></tr>`}
            ${traits ? `<tr><td align="center" style="padding:0 16px 16px;">${traits}</td></tr>` : ""}
            ${summon ? `<tr><td style="padding:0 18px 20px;"><p style="margin:0;color:#f3c768;font-size:13px;line-height:1.6;">Summoned unit: its appearance in game data does not mean it is a newly unlockable character.</p></td></tr>` : ""}
          </table>
        </td></tr>
        <tr><td style="padding:0 10px 22px;">
          <p style="margin:0;color:#b9cadb;font-size:14px;line-height:1.7;">${replay ? `<strong style="color:#f3c768;">Your requested resend, Commander.</strong> ${escapeHtml(replay.intro)}` : `<strong style="color:#f3c768;">A preview for you, Commander.</strong> ${name} is an existing character used to demonstrate this email design. This is your requested sample, not a newly detected character or a new-release announcement.`}</p>
          ${replay?.subject ? `<p style="margin:10px 0 0;color:#a7b7ca;font-size:12px;line-height:1.6;">Original subject: ${escapeHtml(replay.subject)}</p>` : ""}
        </td></tr>
        <tr><td style="padding:0 10px 15px;">
          <p style="margin:0 0 6px;color:#63dbea;font-size:11px;font-weight:bold;letter-spacing:1.8px;">THE KIT, AT A GLANCE</p>
          <h2 style="margin:0 0 8px;color:#ffffff;font-size:24px;line-height:1.25;">Know what each ability does</h2>
          <p style="margin:0;color:#a7b7ca;font-size:13px;line-height:1.6;">${replay ? "The ability descriptions below preserve the wording from your original alert. Artwork and available ability icons have been refreshed; these descriptions are not a claim about current maximum levels or your roster&rsquo;s ability levels." : "Complete normal-kit descriptions at each ability&rsquo;s highest available level in the retrieved game data. These are not your roster&rsquo;s current ability levels."}</p>
        </td></tr>
        ${abilities}
        <tr><td style="padding:6px 0 20px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#272319;border:1px solid #6c5933;border-left:4px solid #f3c768;border-radius:12px;border-collapse:separate;">
            <tr><td style="padding:20px 18px;">
              <p style="margin:0 0 7px;color:#f3c768;font-size:11px;font-weight:bold;letter-spacing:1.4px;">MAKE EVERY RESOURCE COUNT</p>
              <h2 style="margin:0 0 10px;color:#ffffff;font-size:21px;">${summon ? "Understand the summon" : "Before you invest"}</h2>
              <p style="margin:0;color:#e0d8c8;font-size:14px;line-height:1.7;">${summon ? "Use the kit above to understand the summoned unit&rsquo;s contribution. Make resource decisions for characters you can actually upgrade, considering your roster goals and the materials you already need." : "Check your next roster goal, the mode you want to improve, and the gold, training materials, gear, and ability materials you already need. Compare those priorities before committing scarce resources."}</p>
              <p style="margin:12px 0 0;color:#c3b797;font-size:12px;line-height:1.6;">${summon ? "This spotlight does not suggest that the summoned unit can be unlocked or upgraded independently." : `General planning guidance &mdash; this spotlight is not a recommendation to upgrade ${name}.`}</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 10px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;"><tr><td align="center" bgcolor="#63dbea" style="background:#63dbea;border-radius:8px;">
            <a href="${BASE_URL}/heroes" style="display:block;padding:16px 12px;border:1px solid #63dbea;border-radius:8px;color:#07111e;font-size:15px;font-weight:bold;line-height:1.3;text-align:center;text-decoration:none;">Open Heroes Database &rarr;</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:0 10px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;"><tr><td align="center" style="border:1px solid #44627a;border-radius:8px;">
            <a href="${BASE_URL}/planner" style="display:block;padding:16px 12px;border-radius:8px;color:#e6f3fb;font-size:15px;font-weight:bold;line-height:1.3;text-align:center;text-decoration:none;">Open Resource Planner &rarr;</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:20px 10px 0;border-top:1px solid #293d55;">
          <p style="margin:0 0 10px;color:#a7b7ca;font-size:12px;line-height:1.7;">${escapeHtml(fetchedLabel(character.fetchedAt))}. ${replay ? "This retrieval refreshed artwork and available icons; ability wording remains from your original alert. Abilities can change." : "Abilities can change. Artwork and kit information are sourced from the official Marvel Strike Force game data."}</p>
          <p style="margin:0 0 10px;color:#a7b7ca;font-size:12px;line-height:1.7;">${replay ? "Resent only to you at your request. No notification preferences or live email campaigns were changed." : "Sent only as the sample you requested. No notification preferences were changed."} Reply to this email with what you like or would change.</p>
          <p style="margin:0;color:#8195ab;font-size:11px;line-height:1.7;">The MSF Toolkit is an independent companion tool, not an official Marvel or Scopely product. Character artwork belongs to its respective owners.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildSpotlightSampleText(character) {
  const replay = replayDetails(character);
  const summon = isSummon(character);
  const traits = (character.traits ?? []).map((trait) => trait.name || trait.id).join(", ");
  const abilities = (character.abilities ?? []).map((ability) =>
    `${String(ability.type ?? "").toUpperCase()} — ${ability.name}\n${replay ? "From your original alert" : levelLabel(ability.level)}\n${descriptionText(ability.description)}`
  ).join("\n\n");

  if (replay) {
    const artwork = character.costume?.fullArt
      ? `Official costume artwork: ${character.costume.name || "Costume not specified"}. Artwork refreshed from the official game data for this resend.`
      : character.portrait
        ? "Full-body artwork is not available in the official game data; showing the official portrait."
        : "Full-body artwork and a portrait are not available in the retrieved official game data.";
    const planning = summon
      ? "UNDERSTAND THE SUMMON\nUse the kit above to understand the summoned unit's contribution. Make resource decisions for characters you can actually upgrade, considering your roster goals and the materials you already need. This spotlight does not suggest that the summoned unit can be unlocked or upgraded independently."
      : `BEFORE YOU INVEST\nCheck your next roster goal, the mode you want to improve, and the gold, training materials, gear, and ability materials you already need. Compare those priorities before committing scarce resources. This is general planning guidance, not a recommendation to upgrade ${character.name}.`;
    return `THE MSF TOOLKIT\nREQUESTED RESEND · OPTION 1\nCHARACTER SPOTLIGHT: ${character.name}\n\n${summon ? "Meet the summoned unit. Understand its abilities." : "Meet the character. Understand the kit. Plan your next investment."}\n\n${replay.intro}\n${replay.subject ? `Original subject: ${replay.subject}\n` : ""}\n${artwork}\nTraits: ${traits || "Not provided"}\n${summon ? "\nSummoned unit: its appearance in game data does not mean it is a newly unlockable character.\n" : ""}\nTHE KIT FROM YOUR ORIGINAL ALERT\nThe ability descriptions below preserve the wording from your original alert. Artwork and available ability icons have been refreshed; these descriptions are not a claim about current maximum levels or your roster's ability levels.\n\n${abilities}\n\n${planning}\n\nHeroes Database: ${BASE_URL}/heroes\nResource Planner: ${BASE_URL}/planner\n\n${fetchedLabel(character.fetchedAt)}. This retrieval refreshed artwork and available icons; ability wording remains from your original alert. Abilities can change.\n\nResent only to you at your request. No notification preferences or live email campaigns were changed. Reply with what you like or would change.\n\nThe MSF Toolkit is an independent companion tool, not an official Marvel or Scopely product. Character artwork belongs to its respective owners.\n`;
  }

  return `THE MSF TOOLKIT\nSAMPLE · OPTION 1\nCHARACTER SPOTLIGHT: ${character.name}\n\nMeet the character. Understand the kit. Plan your next investment.\n\nThis is your requested design sample using ${character.name}, an existing character. It is not a newly detected character or a new-release announcement.\n\nOfficial costume artwork: ${character.costume?.name || "Not available"}. Costume art is shown for this design preview.\nTraits: ${traits || "Not provided"}\n\nTHE NORMAL ABILITY KIT\nComplete descriptions at the highest available levels in the retrieved game data, not your roster's current ability levels.\n\n${abilities}\n\nBEFORE YOU INVEST\nCheck your next roster goal, the mode you want to improve, and the gold, training materials, gear, and ability materials you already need. Compare those priorities before committing scarce resources. This is general planning guidance, not a recommendation to upgrade ${character.name}.\n\nHeroes Database: ${BASE_URL}/heroes\nResource Planner: ${BASE_URL}/planner\n\n${fetchedLabel(character.fetchedAt)}. Abilities can change. Artwork and kit information are sourced from the official Marvel Strike Force game data.\n\nSent only as the sample you requested. No notification preferences were changed. Reply with what you like or would change.\n\nThe MSF Toolkit is an independent companion tool, not an official Marvel or Scopely product. Character artwork belongs to its respective owners.\n`;
}
