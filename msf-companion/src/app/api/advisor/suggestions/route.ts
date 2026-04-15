import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getScopelyId } from "@/lib/scopely-id";
import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";

/**
 * Returns 4 randomized, roster-personalized suggestion chips for the Advisor landing page.
 * Picks from a pool of ~30 templates and personalizes based on the commander's roster.
 */

interface RosterChar {
  name?: string;
  power?: number;
  gearTier?: number;
  yellowStars?: number;
  redStars?: number;
}

// Templates with optional roster-aware personalization
const SUGGESTION_TEMPLATES = [
  // Team building
  { text: "What team should I build next?", category: "team-comp" },
  { text: "What's the current Arena meta?", category: "team-comp" },
  { text: "Best Crucible defense teams right now?", category: "crucible" },
  { text: "Best Crucible offense counters?", category: "crucible" },
  { text: "What War defense teams should I set?", category: "war" },
  // Dark Dimension
  { text: "Who should I bring to DD5 Cosmic?", category: "dark-dimension" },
  { text: "Best DD5 Global team comp?", category: "dark-dimension" },
  { text: "Who should I farm for DD7?", category: "dark-dimension" },
  { text: "What gear do I need for DD5?", category: "dark-dimension" },
  // Farming
  { text: "What characters should I farm first?", category: "farming" },
  { text: "Best use of campaign energy right now?", category: "farming" },
  { text: "Which blitz store characters are worth buying?", category: "farming" },
  // Investment
  { text: "Is Apocalypse worth investing in?", category: "character-review" },
  { text: "Which characters deserve T4 ability upgrades?", category: "character-review" },
  { text: "Best ISO-8 classes for my top characters?", category: "character-review" },
  { text: "Should I invest in Annihilators?", category: "character-review" },
  // Raids
  { text: "Best raid team for Doom 4?", category: "event" },
  { text: "How do I improve my raid performance?", category: "event" },
  // General strategy
  { text: "How should I spend my gold efficiently?", category: "general" },
  { text: "What game modes should I prioritize daily?", category: "general" },
  { text: "How do I get stronger faster as a mid-game player?", category: "general" },
  { text: "What's the best way to manage resources?", category: "general" },
];

// Roster-aware templates that reference specific characters
function getRosterAwareTemplates(roster: RosterChar[]): string[] {
  const templates: string[] = [];
  if (roster.length === 0) return templates;

  const topChar = roster[0];
  if (topChar?.name) {
    templates.push(`Should I keep investing in ${topChar.name}?`);
  }

  // Find a character at low gear that might be worth upgrading
  const lowGearHighStar = roster.find(
    (c) => (c.gearTier || 0) < 14 && (c.yellowStars || 0) >= 5
  );
  if (lowGearHighStar?.name) {
    templates.push(`Is ${lowGearHighStar.name} worth taking to G16?`);
  }

  // Find a character with high stars but low power (under-invested)
  const underInvested = roster.find(
    (c) => (c.yellowStars || 0) >= 6 && (c.power || 0) < 100000
  );
  if (underInvested?.name) {
    templates.push(`How should I build up ${underInvested.name}?`);
  }

  // Suggest based on total roster size
  if (roster.length < 50) {
    templates.push("What teams should a newer player focus on?");
  } else if (roster.length > 150) {
    templates.push("What endgame teams should I prioritize?");
  }

  return templates;
}

function shuffleAndPick<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

export async function GET() {
  const session = await getSession();
  if (!session.accessToken) {
    // Return generic suggestions for unauthenticated users
    return NextResponse.json({
      suggestions: shuffleAndPick(
        SUGGESTION_TEMPLATES.map((t) => t.text),
        4
      ),
    });
  }

  const scopelyId = await getScopelyId(false);
  if (!scopelyId) {
    return NextResponse.json({
      suggestions: shuffleAndPick(
        SUGGESTION_TEMPLATES.map((t) => t.text),
        4
      ),
    });
  }

  // Get roster for personalization
  let rosterChars: RosterChar[] = [];
  try {
    let chars: RosterChar[] = [];

    const snapshots = await prisma.rosterSnapshot.findMany({
      where: { commander: { scopelyId } },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { snapshotData: true },
    });

    if (snapshots.length > 0 && snapshots[0].snapshotData) {
      const raw = snapshots[0].snapshotData;
      // Handle both formats:
      // Old: { data: [{ id, power, gearTier, activeYellow, info?: { name } }], meta: {...} }
      // New: [{ id, name, power, gearTier, yellowStars, ... }]
      if (Array.isArray(raw)) {
        chars = raw as RosterChar[];
      } else if (typeof raw === "object" && raw !== null && "data" in raw && Array.isArray((raw as { data?: unknown }).data)) {
        const rawChars = (raw as { data: Array<{
          power?: number;
          gearTier?: number;
          activeYellow?: number;
          activeRed?: number;
          info?: { name?: string };
        }> }).data;
        chars = rawChars.map((c) => ({
          name: c.info?.name,
          power: c.power,
          gearTier: c.gearTier,
          yellowStars: c.activeYellow,
          redStars: c.activeRed,
        }));
      }
    }

    // Filter to chars with names
    chars = chars.filter((c) => c.name);

    // If snapshot had no usable names, fall back to live MSF API
    if (chars.length === 0) {
      const token = await getValidAccessToken();
      if (token) {
        const liveRoster = await msfApiFetch<{ data?: Array<{
          power?: number;
          gearTier?: number;
          activeYellow?: number;
          activeRed?: number;
          info?: { name?: string };
        }> }>({
          path: "/player/v1/roster?charInfo=full&traitFormat=id&page=1&perPage=200",
          accessToken: token,
        });
        if (liveRoster.data) {
          chars = liveRoster.data.map((c) => ({
            name: c.info?.name,
            power: c.power,
            gearTier: c.gearTier,
            yellowStars: c.activeYellow,
            redStars: c.activeRed,
          })).filter((c) => c.name);
        }
      }
    }

    if (chars.length > 0) {
      rosterChars = chars
        .sort((a, b) => (b.power || 0) - (a.power || 0))
        .slice(0, 30);
    }
  } catch {
    // Non-blocking
  }

  // Build candidate pool: generic templates + roster-aware ones
  const genericTexts = SUGGESTION_TEMPLATES.map((t) => t.text);
  const rosterTexts = getRosterAwareTemplates(rosterChars);

  // Ensure at least 1 roster-aware suggestion if available
  const suggestions: string[] = [];
  if (rosterTexts.length > 0) {
    suggestions.push(...shuffleAndPick(rosterTexts, Math.min(2, rosterTexts.length)));
  }

  // Fill remaining slots from generic pool (excluding any already picked)
  const remaining = genericTexts.filter((t) => !suggestions.includes(t));
  suggestions.push(...shuffleAndPick(remaining, 4 - suggestions.length));

  return NextResponse.json({ suggestions: suggestions.slice(0, 4) });
}
