import { NextResponse } from "next/server";
import { CosmosClient } from "@azure/cosmos";

const COSMOS_ENDPOINT = process.env.AZURE_COSMOS_ENDPOINT || "";
const COSMOS_KEY = process.env.AZURE_COSMOS_KEY || "";
const COSMOS_DB = process.env.AZURE_COSMOS_DATABASE || "msf-companion";

export async function GET() {
  if (!COSMOS_ENDPOINT || !COSMOS_KEY) {
    return NextResponse.json(getDefaultFallback());
  }

  try {
    const client = new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY });
    const container = client.database(COSMOS_DB).container("static-fallback");

    const { resource } = await container.item("static_fallback_latest", "static_fallback").read();
    if (resource) {
      return NextResponse.json(resource);
    }
  } catch {
    // Fall through to default
  }

  return NextResponse.json(getDefaultFallback());
}

export function getDefaultFallback() {
  return {
    topTeams: [
      { name: "Finish one raid squad", reason: "Concentrate gear instead of spreading resources across unfinished teams.", priority: 1 },
      { name: "Protect your Arena core", reason: "Avoid replacing invested characters until you can compare the full replacement team.", priority: 2 },
      { name: "Build Crucible depth", reason: "Keep enough complete teams for offense before adding luxury defenses.", priority: 3 },
    ],
    farmingPriorities: [
      { character: "Your next unlock requirement", location: "Use the in-game Find button", reason: "Verify the current source before spending campaign energy or currency." },
      { character: "Your next Dark Dimension team", location: "Check your Planner", reason: "Farm the largest roster gaps first and avoid speculative upgrades." },
    ],
    eventRecommendations: [
      { event: "Blitz", recommendation: "Rotate your top 8 teams for maximum milestone rewards" },
      { event: "Cosmic Crucible", recommendation: "Focus defense setup before attacking" },
    ],
    generatedAt: new Date().toISOString(),
    isDefault: true,
    notice: "Live and cached meta data are unavailable, so these are general planning guardrails—not current team or farming claims.",
  };
}
