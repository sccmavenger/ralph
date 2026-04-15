import { NextResponse } from "next/server";
import { filterEligible, type RosterCharacter } from "@/lib/dd-eligibility";
import type { NodeRequirements } from "@/lib/dd-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as {
      roster: RosterCharacter[];
      requirements: NodeRequirements;
    };

    const result = filterEligible(body.roster, body.requirements);

    return NextResponse.json({
      eligible: result.eligible.map((c) => ({ id: c.id })),
      compliant: result.compliant.map((c) => ({ id: c.id })),
      maxCharacters: result.maxCharacters,
      minCharacters: result.minCharacters,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
