/**
 * Game data document generator library.
 * Converts raw MSF API responses into natural-language KB documents
 * so that structured game data becomes searchable knowledge.
 */

export interface CharacterData {
  id: string;
  name: string;
  traits: string[];
  abilities: Array<{ name: string; description: string }>;
  teams: string[];
}

export interface TeamData {
  characters: string[];
  totalBattles: number;
  wins: number;
  winRate: number;
  rank: number;
}

export interface DDData {
  id: string;
  name: string;
}

export interface NodeData {
  id: string;
  nodeNumber: number;
  section: string;
  requiredTraits: string[];
  enemies: Array<{ name: string; power?: number }>;
}

export interface ISO8Data {
  topClass: string;
  topClassPercent: number;
  runnerUps: Array<{ className: string; percent: number }>;
}

export interface GearItem {
  name: string;
  quantity: number;
  farmable: boolean;
}

export interface KBDocument {
  id: string;
  content: string;
  category: string;
  sourceCreatorName: string;
  sourceVideoTitle: string;
  sourceUrl: string;
  sourceDate: string;
  sourceTier: number;
  sourceType: string;
}

const today = () => new Date().toISOString().split("T")[0];

export function generateCharacterKitDoc(character: CharacterData): KBDocument {
  const traits = character.traits.join(", ");
  const teams = character.teams.length > 0 ? character.teams.join(", ") : "No specific team";
  const abilities = character.abilities
    .map((a) => `${a.name}: ${a.description}`)
    .join(". ");

  const content = `${character.name} is a Marvel Strike Force character with the following traits: ${traits}. ` +
    `Team affiliations: ${teams}. ` +
    `Abilities: ${abilities}. ` +
    `${character.name} can be a valuable addition to ${teams} teams in various game modes.`;

  return {
    id: `api-char-${character.id}`,
    content,
    category: "character-kits",
    sourceCreatorName: "MSF API (Official)",
    sourceVideoTitle: `${character.name} — Character Kit Overview`,
    sourceUrl: "https://marvelstrikeforce.com/en/characters",
    sourceDate: today(),
    sourceTier: 1,
    sourceType: "api-game-data",
  };
}

export function generateTeamMetaDoc(team: TeamData, mode: string): KBDocument {
  const chars = team.characters.join(", ");
  const winPct = (team.winRate * 100).toFixed(1);

  const content = `In ${mode} mode, the team of ${chars} is ranked #${team.rank} with a ${winPct}% win rate ` +
    `across ${team.totalBattles} total battles. This team composition has proven effective in ${mode} ` +
    `and players should consider building these characters for competitive ${mode} play.`;

  return {
    id: `api-meta-${mode}-${team.rank}`,
    content,
    category: "war-meta",
    sourceCreatorName: "MSF API (Official)",
    sourceVideoTitle: `${mode} Meta — Rank #${team.rank} Team`,
    sourceUrl: "https://marvelstrikeforce.com/en/meta",
    sourceDate: today(),
    sourceTier: 1,
    sourceType: "api-game-data",
  };
}

export function generateDDNodeDoc(dd: DDData, node: NodeData): KBDocument {
  const enemies = node.enemies
    .map((e) => (e.power ? `${e.name} (Power: ${e.power})` : e.name))
    .join(", ");
  const traits = node.requiredTraits.length > 0
    ? `Required traits: ${node.requiredTraits.join(", ")}.`
    : "No specific trait requirements.";

  const content = `${dd.name} Node ${node.nodeNumber} (${node.section} section): ` +
    `${traits} ` +
    `Enemy composition: ${enemies}. ` +
    `Players attempting ${dd.name} should prepare characters matching these requirements ` +
    `for Node ${node.nodeNumber}.`;

  return {
    id: `api-dd-${dd.id}-${node.id}`,
    content,
    category: "dark-dimension",
    sourceCreatorName: "MSF API (Official)",
    sourceVideoTitle: `${dd.name} — Node ${node.nodeNumber} Requirements`,
    sourceUrl: "https://marvelstrikeforce.com/en/dark-dimension",
    sourceDate: today(),
    sourceTier: 1,
    sourceType: "api-game-data",
  };
}

export function generateISO8Doc(character: string, isoData: ISO8Data): KBDocument {
  const runnerUps = isoData.runnerUps
    .map((r) => `${r.className} (${r.percent.toFixed(1)}%)`)
    .join(", ");

  const content = `ISO-8 recommendation for ${character}: The top ISO-8 class is ${isoData.topClass} ` +
    `with ${isoData.topClassPercent.toFixed(1)}% confidence based on 30 days of game data. ` +
    (runnerUps ? `Runner-up classes: ${runnerUps}. ` : "") +
    `Players should equip ${character} with the ${isoData.topClass} ISO-8 class for optimal performance.`;

  return {
    id: `api-iso8-${character.toLowerCase().replace(/\s+/g, "-")}`,
    content,
    category: "iso-8",
    sourceCreatorName: "MSF API (Official)",
    sourceVideoTitle: `${character} — ISO-8 Recommendation`,
    sourceUrl: "https://marvelstrikeforce.com/en/meta/iso",
    sourceDate: today(),
    sourceTier: 1,
    sourceType: "api-game-data",
  };
}

export function generateGearDoc(
  character: string,
  fromTier: number,
  toTier: number,
  items: GearItem[]
): KBDocument {
  const itemList = items
    .map((i) => `${i.name} x${i.quantity}${i.farmable ? " (farmable)" : " (unfarmable)"}`)
    .join(", ");

  const content = `Gear requirements for ${character} from Gear Tier ${fromTier} to ${toTier}: ` +
    `${itemList}. ` +
    `Total unique items needed: ${items.length}. ` +
    `Farmable items: ${items.filter((i) => i.farmable).length}, ` +
    `Unfarmable items: ${items.filter((i) => !i.farmable).length}.`;

  return {
    id: `api-gear-tier-${toTier}-${character.toLowerCase().replace(/\s+/g, "-")}`,
    content,
    category: "gear-guide",
    sourceCreatorName: "MSF API (Official)",
    sourceVideoTitle: `${character} — G${fromTier} to G${toTier} Gear Requirements`,
    sourceUrl: "https://marvelstrikeforce.com/en/gear",
    sourceDate: today(),
    sourceTier: 1,
    sourceType: "api-game-data",
  };
}
