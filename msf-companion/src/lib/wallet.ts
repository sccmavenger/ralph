import { prisma } from "@/lib/prisma";
import type { CommanderWallet } from "@/generated/prisma/client";

/**
 * Self-reported wallet balances. Gold and Power Cores are the only two
 * progression currencies the MSF API does NOT expose, so they are entered
 * manually by the commander. An absent wallet (null) is a valid state — the
 * feature is optional.
 */
export interface WalletInput {
  gold: number;
  cores: number;
}

export class WalletValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletValidationError";
  }
}

/**
 * Validates that a value is a non-negative, safe integer. Throws
 * WalletValidationError otherwise.
 */
export function assertNonNegativeInteger(value: unknown, field: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new WalletValidationError(
      `${field} must be a non-negative integer`,
    );
  }
  return value;
}

/** Normalizes and validates raw wallet input. */
export function validateWalletInput(input: {
  gold: unknown;
  cores: unknown;
}): WalletInput {
  return {
    gold: assertNonNegativeInteger(input.gold, "gold"),
    cores: assertNonNegativeInteger(input.cores, "cores"),
  };
}

/**
 * Reads the wallet for an account. Returns null when no wallet exists
 * (absent wallet is valid — the feature is optional).
 */
export async function getWalletByCommanderId(
  commanderId: string,
): Promise<CommanderWallet | null> {
  return prisma.commanderWallet.findUnique({ where: { commanderId } });
}

/**
 * Creates or updates the single wallet for an account, validating that both
 * values are non-negative integers and refreshing confirmedAt to now.
 */
export async function upsertWallet(
  commanderId: string,
  input: { gold: unknown; cores: unknown },
): Promise<CommanderWallet> {
  const { gold, cores } = validateWalletInput(input);
  const confirmedAt = new Date();
  return prisma.commanderWallet.upsert({
    where: { commanderId },
    create: { commanderId, gold, cores, confirmedAt },
    update: { gold, cores, confirmedAt },
  });
}
