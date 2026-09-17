import type { SyncedCharacter } from "@/lib/kb-official-sync";

const BASE_URL = "https://themsftoolkit.com";
const FONT = "Arial,Helvetica,sans-serif";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// MSF rich text is not trusted HTML. Preserve wording and paragraph breaks,
// remove only known formatting tags, and escape everything else when rendering.
function descriptionText(value: string): string {
  return value.replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<p(?:\s[^>]*)?>/gi, "")
    .replace(/<\/?(?:color|size|b|i|u)(?:=[^>]*)?\s*>/gi, "")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n").trim();
}

function descriptionHtml(value: string): string {
  return descriptionText(value).split(/\n\n+/).map((paragraph) =>
    `<p style="margin:0 0 12px;color:#dce6f2;font-size:15px;line-height:1.65;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`
  ).join("");
}

// The delivery layer verifies/embeds available assets. The renderer still
// enforces provenance and never emits arbitrary remote or executable URLs.
function imageUrl(value: string | undefined): string {
  if (!value) return "";
  if (/^cid:[a-zA-Z0-9._@-]+$/.test(value)) return escapeHtml(value);
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:" && parsed.hostname === "assets.marvelstrikeforce.com"
      && !parsed.username && !parsed.password && !parsed.port) {
      return escapeHtml(parsed.href);
    }
  } catch {
    // Missing or invalid images never prevent a readable text spotlight.
  }
  return "";
}

function isSummon(character: SyncedCharacter): boolean {
  return character.traits.some((trait) => trait.trim().toLowerCase() === "summon");
}

function levelLabel(level: number | undefined): string {
  return typeof level === "number" && Number.isInteger(level) && level > 0
    ? `Highest available level ${level}`
    : "Ability level not provided";
}

function abilityCard(ability: SyncedCharacter["abilities"][number]): string {
  const icon = imageUrl(ability.icon);
  return `<tr><td style="padding:0 0 14px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;table-layout:fixed;border-collapse:separate;background:#111f33;border:1px solid #293d55;border-radius:14px;">
      <tr><td style="padding:20px 18px 6px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;table-layout:fixed;">
          <tr>${icon ? `<td width="58" valign="top" style="width:58px;padding:2px 10px 0 0;"><img src="${icon}" width="48" height="48" alt="${escapeHtml(ability.name)} ability icon" style="display:block;width:48px;height:48px;border:0;border-radius:10px;"></td>` : ""}
            <td valign="top" style="overflow-wrap:anywhere;word-break:break-word;">
              <p style="margin:0 0 5px;color:#63dbea;font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;">${escapeHtml(ability.type || "Ability")}</p>
              <h3 style="margin:0 0 5px;color:#ffffff;font-size:19px;line-height:1.3;">${escapeHtml(ability.name)}</h3>
              <p style="margin:0;color:#a7b7ca;font-size:12px;line-height:1.5;">${levelLabel(ability.level)}</p>
            </td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:12px 18px 8px;">${descriptionHtml(ability.description)}</td></tr>
    </table>
  </td></tr>`;
}

function artworkCaption(character: SyncedCharacter): string {
  if (imageUrl(character.fullBodyArt?.url)) {
    return `Official costume artwork: ${character.fullBodyArt?.costumeName || "Costume not specified"}.`;
  }
  return imageUrl(character.portrait)
    ? "Official character portrait. Full-body artwork is not available for this spotlight."
    : "Character artwork is not available for this spotlight.";
}

function planningText(character: SyncedCharacter): string {
  return isSummon(character)
    ? "Use the kit above to understand the summoned unit's contribution. Make resource decisions for characters you can actually upgrade, considering your roster goals and the materials you already need."
    : "Check your next roster goal, the mode you want to improve, and the gold, training materials, gear, and ability materials you already need. Compare those priorities before committing scarce resources.";
}

function planningCaveat(character: SyncedCharacter): string {
  return isSummon(character)
    ? "This spotlight does not suggest that the summoned unit can be unlocked or upgraded independently."
    : `General planning guidance — this spotlight is not a recommendation to upgrade ${character.name}.`;
}

/** Presentation only: recipient selection, consent, and delivery stay separate. */
export function buildNewCharacterEmailHtml(character: SyncedCharacter): string {
  const name = escapeHtml(character.name);
  const summon = isSummon(character);
  const portrait = imageUrl(character.portrait);
  const art = imageUrl(character.fullBodyArt?.url);
  const costumeName = escapeHtml(character.fullBodyArt?.costumeName || "Costume not specified");
  const portraitSize = art ? 64 : 144;
  const traits = character.traits.map((trait) =>
    `<span style="display:inline-block;max-width:100%;box-sizing:border-box;margin:0 5px 7px 0;padding:6px 9px;background:#142c40;border:1px solid #31516a;border-radius:6px;color:#c4eef2;font-size:12px;line-height:1.3;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(trait)}</span>`
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <title>${name} · Character Spotlight</title>
</head>
<body style="margin:0;padding:0;background:#07111e;color:#ffffff;font-family:${FONT};-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;color:#07111e;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">New character detected in the official game data: ${name}. Explore the normal ability kit and plan your resources.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#07111e" style="width:100%;background:#07111e;border-collapse:collapse;table-layout:fixed;">
    <tr><td align="center" style="padding:24px 10px 32px;">
      <!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;table-layout:fixed;">
        <tr><td style="padding:0 10px 22px;">
          <p style="margin:0 0 10px;color:#ffffff;font-size:16px;font-weight:bold;letter-spacing:2px;">THE MSF TOOLKIT</p>
          <p style="margin:0;color:#f3c768;font-size:11px;font-weight:bold;letter-spacing:1.8px;">NEW CHARACTER DETECTED</p>
        </td></tr>
        <tr><td style="padding:0 0 20px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;table-layout:fixed;background:#0d1d30;border:1px solid #2a4860;border-top:3px solid #63dbea;border-radius:16px;border-collapse:separate;">
            <tr><td align="center" style="padding:28px 18px 12px;">
              <p style="margin:0 0 14px;color:#63dbea;font-size:12px;font-weight:bold;letter-spacing:2.5px;">CHARACTER SPOTLIGHT</p>
              ${portrait ? `<img src="${portrait}" width="${portraitSize}" height="${portraitSize}" alt="${name} portrait" style="display:block;width:${portraitSize}px;height:${portraitSize}px;margin:0 auto 12px;border:1px solid #31516a;border-radius:50%;">` : ""}
              <h1 style="margin:0 0 10px;color:#ffffff;font-size:34px;line-height:1.15;overflow-wrap:anywhere;word-break:break-word;">${name}</h1>
              <p style="margin:0;color:#b9cadb;font-size:15px;line-height:1.6;">${summon ? "Meet the summoned unit.<br>Understand its abilities." : "Meet the character. Understand the kit.<br>Plan your next investment."}</p>
            </td></tr>
            ${art ? `<tr><td align="center" style="padding:10px 18px 0;"><img src="${art}" width="280" alt="Official ${name} full-body artwork in the ${costumeName} costume" style="display:block;width:100%;max-width:280px;height:auto;border:0;border-radius:10px;margin:0 auto;"></td></tr>` : ""}
            <tr><td align="center" style="padding:12px 18px 18px;"><p style="margin:0;color:#a7b7ca;font-size:12px;line-height:1.6;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(artworkCaption(character))}</p></td></tr>
            ${traits ? `<tr><td align="center" style="padding:0 16px 16px;">${traits}</td></tr>` : ""}
            ${character.teams.length ? `<tr><td align="center" style="padding:0 18px 16px;"><p style="margin:0;color:#a7b7ca;font-size:12px;line-height:1.6;overflow-wrap:anywhere;word-break:break-word;">Team traits: ${escapeHtml(character.teams.join(", "))}</p></td></tr>` : ""}
            ${summon ? `<tr><td style="padding:0 18px 20px;"><p style="margin:0;color:#f3c768;font-size:13px;line-height:1.6;">Summoned unit: its appearance in game data does not mean it is a newly unlockable character.</p></td></tr>` : ""}
          </table>
        </td></tr>
        <tr><td style="padding:0 10px 22px;">
          <p style="margin:0;color:#b9cadb;font-size:14px;line-height:1.7;overflow-wrap:anywhere;word-break:break-word;"><strong style="color:#f3c768;">New intel, Commander.</strong> We detected ${name} in the official Marvel Strike Force game data. Detection does not confirm a release date or unlock availability.</p>
        </td></tr>
        <tr><td style="padding:0 10px 15px;">
          <p style="margin:0 0 6px;color:#63dbea;font-size:11px;font-weight:bold;letter-spacing:1.8px;">THE KIT, AT A GLANCE</p>
          <h2 style="margin:0 0 8px;color:#ffffff;font-size:24px;line-height:1.25;">Know what each ability does</h2>
          <p style="margin:0;color:#a7b7ca;font-size:13px;line-height:1.6;">${character.abilities.length ? "Available normal-kit descriptions from the official game data. Where provided, the levels shown are the highest available in that data, not your roster&rsquo;s current ability levels." : "Normal-kit ability details are not available in the retrieved game data yet."}</p>
        </td></tr>
        ${character.abilities.map(abilityCard).join("")}
        <tr><td style="padding:6px 0 20px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;table-layout:fixed;background:#272319;border:1px solid #6c5933;border-left:4px solid #f3c768;border-radius:12px;border-collapse:separate;">
            <tr><td style="padding:20px 18px;">
              <p style="margin:0 0 7px;color:#f3c768;font-size:11px;font-weight:bold;letter-spacing:1.4px;">MAKE EVERY RESOURCE COUNT</p>
              <h2 style="margin:0 0 10px;color:#ffffff;font-size:21px;">${summon ? "Understand the summon" : "Before you invest"}</h2>
              <p style="margin:0;color:#e0d8c8;font-size:14px;line-height:1.7;">${escapeHtml(planningText(character))}</p>
              <p style="margin:12px 0 0;color:#c3b797;font-size:12px;line-height:1.6;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(planningCaveat(character))}</p>
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
          <p style="margin:0 0 10px;color:#a7b7ca;font-size:12px;line-height:1.7;">Artwork and kit information are sourced from the official Marvel Strike Force game data. Abilities can change.</p>
          <p style="margin:0;color:#8195ab;font-size:11px;line-height:1.7;">The MSF Toolkit is an independent companion tool, not an official Marvel or Scopely product. Character artwork belongs to its respective owners.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildNewCharacterEmailText(character: SyncedCharacter): string {
  const summon = isSummon(character);
  const abilities = character.abilities.map((ability) =>
    `${(ability.type || "Ability").toUpperCase()} — ${ability.name}\n${levelLabel(ability.level)}\n${descriptionText(ability.description)}`
  ).join("\n\n");

  return `THE MSF TOOLKIT
NEW CHARACTER DETECTED
CHARACTER SPOTLIGHT: ${character.name}

${summon ? "Meet the summoned unit. Understand its abilities." : "Meet the character. Understand the kit. Plan your next investment."}

New intel, Commander. We detected ${character.name} in the official Marvel Strike Force game data. Detection does not confirm a release date or unlock availability.

${artworkCaption(character)}
Traits: ${character.traits.join(", ") || "Not provided"}
${character.teams.length ? `Team traits: ${character.teams.join(", ")}\n` : ""}${summon ? "\nSummoned unit: its appearance in game data does not mean it is a newly unlockable character.\n" : ""}
THE NORMAL ABILITY KIT
${abilities ? "Available normal-kit descriptions from the official game data. Where provided, the levels shown are the highest available in that data, not your roster's current ability levels." : "Normal-kit ability details are not available in the retrieved game data yet."}

${abilities}

MAKE EVERY RESOURCE COUNT
${summon ? "UNDERSTAND THE SUMMON" : "BEFORE YOU INVEST"}
${planningText(character)}
${planningCaveat(character)}

Heroes Database: ${BASE_URL}/heroes
Resource Planner: ${BASE_URL}/planner

Artwork and kit information are sourced from the official Marvel Strike Force game data. Abilities can change.

The MSF Toolkit is an independent companion tool, not an official Marvel or Scopely product. Character artwork belongs to its respective owners.
`;
}
