import { NextResponse } from "next/server";
import { getScopelyId } from "@/lib/scopely-id";
import { prisma } from "@/lib/prisma";
import {
  getWalletByCommanderId,
  upsertWallet,
  validateWalletInput,
  WalletValidationError,
} from "@/lib/wallet";
import type { CommanderWallet } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
    { status: 401 },
  );
}

/** Serializes a wallet row into the public API shape. */
function serializeWallet(wallet: CommanderWallet) {
  return {
    exists: true as const,
    gold: wallet.gold,
    cores: wallet.cores,
    confirmedAt: wallet.confirmedAt.toISOString(),
  };
}

/** Explicit empty state — the feature is optional, so an absent wallet is valid. */
const EMPTY_WALLET = {
  exists: false as const,
  gold: null,
  cores: null,
  confirmedAt: null,
};

/**
 * GET /api/msf/wallet — returns the authenticated commander's wallet, or an
 * explicit empty state when none exists. 401 when unauthenticated.
 */
export async function GET() {
  const scopelyId = await getScopelyId(true);
  if (!scopelyId) return unauthorized();

  const commander = await prisma.commander.findUnique({
    where: { scopelyId },
    select: { id: true },
  });
  if (!commander) {
    return NextResponse.json(EMPTY_WALLET);
  }

  const wallet = await getWalletByCommanderId(commander.id);
  if (!wallet) {
    return NextResponse.json(EMPTY_WALLET);
  }

  return NextResponse.json(serializeWallet(wallet));
}

/**
 * PUT /api/msf/wallet — validates and persists { gold, cores } for the
 * authenticated commander, refreshing confirmedAt to now. 401 unauthenticated,
 * 400 on invalid input.
 */
export async function PUT(request: Request) {
  const scopelyId = await getScopelyId(true);
  if (!scopelyId) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_INPUT", retryable: false },
      { status: 400 },
    );
  }

  const { gold, cores } = (body ?? {}) as { gold?: unknown; cores?: unknown };

  // Validate before any write so invalid input never mutates an existing wallet.
  try {
    validateWalletInput({ gold, cores });
  } catch (err) {
    if (err instanceof WalletValidationError) {
      return NextResponse.json(
        { error: err.message, code: "INVALID_INPUT", retryable: false },
        { status: 400 },
      );
    }
    throw err;
  }

  // Resolve (or create) the commander row scoped to this account only.
  const commander = await prisma.commander.upsert({
    where: { scopelyId },
    create: { scopelyId },
    update: {},
    select: { id: true },
  });

  const wallet = await upsertWallet(commander.id, { gold, cores });
  return NextResponse.json(serializeWallet(wallet));
}
