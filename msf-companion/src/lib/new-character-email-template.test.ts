import { describe, expect, it } from "vitest";
import type { SyncedCharacter } from "./kb-official-sync";
import { buildNewCharacterEmailHtml, buildNewCharacterEmailText } from "./new-character-email-template";

const character: SyncedCharacter = {
  id: "SpiderMan",
  name: "Spider-Man",
  traits: ["Hero", "City", "Bio", "Spider-Verse"],
  teams: ["Spider-Verse"],
  portrait: "https://assets.marvelstrikeforce.com/portraits/SpiderMan.png",
  fullBodyArt: {
    url: "https://assets.marvelstrikeforce.com/key_art/SpiderMan.jpg",
    costumeName: "No Way Home",
  },
  abilities: [
    { type: "basic", name: "Basic Move", description: "Attack primary target for 300% damage.", level: 7, icon: "https://assets.marvelstrikeforce.com/ability_icons/basic.png" },
    { type: "special", name: "Special Move", description: "Apply Defense Down for 2 turns.", level: 7 },
    { type: "ultimate", name: "Ultimate Move", description: "Attack all enemies for 250% damage.", level: 7 },
    { type: "passive", name: "Passive Move", description: "On Spawn, gain Defense Up.\n\nGain +20% Max Health.", level: 5 },
  ],
};

describe("production character spotlight email", () => {
  it("renders the approved layout with full-body costume art, portrait, traits, and four full ability cards", () => {
    const html = buildNewCharacterEmailHtml(character);
    expect(html).toContain("CHARACTER SPOTLIGHT");
    expect(html).toContain("NEW CHARACTER DETECTED");
    expect(html).toContain('background:#07111e');
    expect(html).toContain('max-width:600px');
    expect(html).toContain('width:100%');
    expect(html).toContain('name="viewport" content="width=device-width,initial-scale=1.0"');
    expect(html).toContain('src="https://assets.marvelstrikeforce.com/key_art/SpiderMan.jpg"');
    expect(html).toContain("Official costume artwork: No Way Home.");
    expect(html).toContain('width="64" height="64"');
    expect(html.match(/<h3 /g)).toHaveLength(4);
    for (const ability of character.abilities) {
      expect(html).toContain(ability.name);
      for (const paragraph of ability.description.split("\n\n")) expect(html).toContain(paragraph);
    }
    for (const trait of character.traits) expect(html).toContain(trait);
    expect(html).toContain("Highest available level 7");
    expect(html).toContain('href="https://themsftoolkit.com/heroes"');
    expect(html).toContain('href="https://themsftoolkit.com/planner"');
  });

  it("has production copy without demo labels or unsupported release, meta, and spending claims", () => {
    for (const output of [buildNewCharacterEmailHtml(character), buildNewCharacterEmailText(character)]) {
      expect(output).not.toMatch(/\b(?:SAMPLE|PREVIEW|RESEND|OPTION 1)\b/i);
      expect(output).toContain("Detection does not confirm a release date or unlock availability.");
      expect(output).toContain("not a recommendation to upgrade Spider-Man");
      expect(output).not.toMatch(/unlock now|available now|must[- ]build|top[- ]tier|meta[- ]defining|guaranteed|best investment/i);
      expect(output).toContain("Abilities can change.");
    }
  });

  it("uses a large portrait when full-body art is unavailable", () => {
    const html = buildNewCharacterEmailHtml({ ...character, fullBodyArt: undefined });
    expect(html).toContain('width="144" height="144"');
    expect(html).toContain("Official character portrait. Full-body artwork is not available for this spotlight.");
    expect(html).not.toContain("key_art/");
    expect(html).not.toContain("Official costume artwork:");
  });

  it("keeps all kit text without broken image placeholders when no images are available", () => {
    const withoutImages: SyncedCharacter = {
      ...character, portrait: undefined, fullBodyArt: undefined,
      abilities: character.abilities.map((ability) => ({ ...ability, icon: undefined })),
    };
    const html = buildNewCharacterEmailHtml(withoutImages);
    expect(html).not.toContain("<img ");
    expect(html).toContain("Character artwork is not available for this spotlight.");
    expect(html.match(/<h3 /g)).toHaveLength(4);
    expect(html).toContain("Gain +20% Max Health.");
  });

  it("labels artwork with an explicit unknown costume if no costume name is supplied", () => {
    const input: SyncedCharacter = { ...character, fullBodyArt: { url: character.fullBodyArt!.url } };
    expect(buildNewCharacterEmailHtml(input)).toContain("Official costume artwork: Costume not specified.");
    expect(buildNewCharacterEmailText(input)).toContain("Official costume artwork: Costume not specified.");
  });

  it("renders a three-ability summoned minion without inventing an ultimate or an independent build recommendation", () => {
    const minion: SyncedCharacter = {
      ...character, name: "Elite S.H.I.E.L.D. Medic", traits: ["Skill", " Summon "],
      abilities: character.abilities.filter((ability) => ability.type !== "ultimate"),
    };
    const html = buildNewCharacterEmailHtml(minion);
    const text = buildNewCharacterEmailText(minion);
    expect(html.match(/<h3 /g)).toHaveLength(3);
    for (const output of [html, text]) {
      expect(output).toContain("Summoned unit: its appearance in game data does not mean it is a newly unlockable character.");
      expect(output).toContain("This spotlight does not suggest that the summoned unit can be unlocked or upgraded independently.");
      expect(output).not.toContain("Ultimate Move");
      expect(output).not.toMatch(/Before you invest|Plan your next investment/i);
      expect(output).toContain("characters you can actually upgrade");
    }
  });

  it("escapes all HTML fields, including image alt text, traits, teams, costume name, and abilities", () => {
    const attack = '<img src=x onerror="alert(1)"> & \'test\'';
    const html = buildNewCharacterEmailHtml({
      ...character, name: attack, traits: [attack], teams: [attack],
      fullBodyArt: { ...character.fullBodyArt!, costumeName: attack },
      abilities: [{ name: attack, description: '<script>alert("kit")</script> & Hit > once', icon: character.abilities[0].icon }],
    });
    expect(html).not.toContain(attack);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;test&#39;");
    expect(html).toContain("&lt;script&gt;alert(&quot;kit&quot;)&lt;/script&gt; &amp; Hit &gt; once");
  });

  it("cleans MSF formatting while preserving complete paragraphs and line breaks", () => {
    const input: SyncedCharacter = {
      ...character,
      abilities: [{ name: "Ability", description: '<p><color=#ff0000><b>Attack</b></color> for 300%.<br/>Then gain <size=18>Speed Up</size>.</p><p><i>On turn:</i>\r\n  Apply Defense Up.</p>' }],
    };
    const html = buildNewCharacterEmailHtml(input);
    const text = buildNewCharacterEmailText(input);
    expect(html).toContain("Attack for 300%.<br>Then gain Speed Up.</p>");
    expect(html).toContain("On turn:<br>Apply Defense Up.</p>");
    expect(text).toContain("Attack for 300%.\nThen gain Speed Up.\n\nOn turn:\nApply Defense Up.");
    for (const output of [html, text]) expect(output).not.toMatch(/<\/?(?:color|size|b|i)[=>]/);
  });

  it.each([
    "http://assets.marvelstrikeforce.com/image.png",
    "https://attacker.example/image.png",
    "https://assets.marvelstrikeforce.com.attacker.example/image.png",
    "https://assets.marvelstrikeforce.com@attacker.example/image.png",
    "https://user:pass@assets.marvelstrikeforce.com/image.png",
    "https://assets.marvelstrikeforce.com:444/image.png",
    "javascript:alert(1)",
    "data:image/png;base64,AA==",
    'cid:hero" onerror="alert(1)',
    "cid:has space",
    "cid:",
    "assets/local-preview.png",
    "//assets.marvelstrikeforce.com/image.png",
  ])("omits unsafe or nonofficial image sources: %s", (url) => {
    const input: SyncedCharacter = {
      ...character, portrait: url, fullBodyArt: { url },
      abilities: [{ name: "Safe ability", description: "Still readable", icon: url }],
    };
    const html = buildNewCharacterEmailHtml(input);
    expect(html).not.toContain("<img ");
    expect(html).toContain("Still readable");
    expect(html).toContain("Character artwork is not available for this spotlight.");
  });

  it("accepts validated CID references for embedded official artwork and icons", () => {
    const html = buildNewCharacterEmailHtml({
      ...character, portrait: "cid:portrait.SpiderMan@msftoolkit",
      fullBodyArt: { url: "cid:art-SpiderMan_1", costumeName: "No Way Home" },
      abilities: [{ name: "Basic", description: "Attack", icon: "cid:ability.basic_1" }],
    });
    expect(html).toContain('src="cid:portrait.SpiderMan@msftoolkit"');
    expect(html).toContain('src="cid:art-SpiderMan_1"');
    expect(html).toContain('src="cid:ability.basic_1"');
  });

  it("escapes query parameters on allowed official image URLs", () => {
    const html = buildNewCharacterEmailHtml({
      ...character, portrait: "https://assets.marvelstrikeforce.com/portrait.png?a=1&b=2",
    });
    expect(html).toContain('src="https://assets.marvelstrikeforce.com/portrait.png?a=1&amp;b=2"');
  });

  it("does not invent missing ability levels or missing abilities", () => {
    const html = buildNewCharacterEmailHtml({
      ...character, abilities: [{ name: "Unknown level", description: "Details", level: Number.NaN }],
    });
    expect(html).toContain("Ability level not provided");
    expect(html).not.toContain("Highest available level NaN");
    const empty = { ...character, abilities: [] };
    expect(buildNewCharacterEmailHtml(empty)).toContain("Normal-kit ability details are not available in the retrieved game data yet.");
    expect(buildNewCharacterEmailText(empty)).toContain("Normal-kit ability details are not available in the retrieved game data yet.");
    expect(buildNewCharacterEmailHtml(empty)).not.toContain("<h3 ");
  });

  it("produces complete readable plain text without email markup", () => {
    const text = buildNewCharacterEmailText(character);
    expect(text).toContain("CHARACTER SPOTLIGHT: Spider-Man");
    expect(text).toContain("Traits: Hero, City, Bio, Spider-Verse");
    expect(text).toContain("Team traits: Spider-Verse");
    expect(text).toContain("Official costume artwork: No Way Home.");
    expect(text).toContain("On Spawn, gain Defense Up.\n\nGain +20% Max Health.");
    expect(text).toContain("Resource Planner: https://themsftoolkit.com/planner");
    expect(text).not.toMatch(/<html|<table|<img|&rsquo;/);
  });
});
