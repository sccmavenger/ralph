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

function getDefaultFallback() {
  return {
    topTeams: [
      { name: "Eternals", reason: "Top raid team across all game modes", priority: 1 },
      { name: "Gamma Team", reason: "Essential for Gamma raids", priority: 2 },
      { name: "Darkhold", reason: "Strong in Cosmic Crucible and War", priority: 3 },
      { name: "Unlimited X-Men", reason: "Top Arena and War offense", priority: 4 },
      { name: "Bifrost", reason: "Strong in multiple game modes", priority: 5 },
    ],
    farmingPriorities: [
      { character: "Cosmic Ghost Rider", location: "Doom Campaign 3-9", reason: "Meta team member" },
      { character: "Gladiator", location: "Nexus Campaign 8-6", reason: "Raid essential" },
      { character: "Kestrel", location: "Nexus Campaign 7-3", reason: "Versatile plug-and-play" },
    ],
    eventRecommendations: [
      { event: "Blitz", recommendation: "Rotate your top 8 teams for maximum milestone rewards" },
      { event: "Cosmic Crucible", recommendation: "Focus defense setup before attacking" },
    ],
    generatedAt: new Date().toISOString(),
  };
}
