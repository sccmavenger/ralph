import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getWalletByCommanderId,
  upsertWallet,
  validateWalletInput,
  WalletValidationError,
} from "@/lib/wallet";

/**
 * US-001 persistence integration tests (TC-001.2 – TC-001.5).
 * These run against the configured DATABASE_URL and create/clean up their
 * own throwaway Commander rows.
 */
const suffix = `wallet-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let commanderA: string;
let commanderB: string;

describe("CommanderWallet persistence", () => {
  beforeAll(async () => {
    const a = await prisma.commander.create({
      data: { scopelyId: `a-${suffix}` },
    });
    const b = await prisma.commander.create({
      data: { scopelyId: `b-${suffix}` },
    });
    commanderA = a.id;
    commanderB = b.id;
  });

  afterAll(async () => {
    // onDelete: Cascade removes the wallet rows too.
    await prisma.commander.deleteMany({
      where: { id: { in: [commanderA, commanderB] } },
    });
    await prisma.$disconnect();
  });

  it("TC-001.2 persists and reads back a wallet with a valid confirmedAt", async () => {
    const saved = await upsertWallet(commanderA, { gold: 1840000, cores: 6120 });
    expect(saved.gold).toBe(1840000);
    expect(saved.cores).toBe(6120);
    expect(saved.confirmedAt).toBeInstanceOf(Date);
    expect(Number.isNaN(saved.confirmedAt.getTime())).toBe(false);

    const read = await getWalletByCommanderId(commanderA);
    expect(read).not.toBeNull();
    expect(read!.gold).toBe(1840000);
    expect(read!.cores).toBe(6120);
    expect(read!.commanderId).toBe(commanderA);
  });

  it("TC-001.3 enforces one wallet per account (unique constraint)", async () => {
    // A wallet already exists for commanderA from the previous test; a raw
    // create (bypassing upsert) for the same account must be rejected.
    await expect(
      prisma.commanderWallet.create({
        data: { commanderId: commanderA, gold: 1, cores: 1 },
      }),
    ).rejects.toThrow();
  });

  it("TC-001.4 returns null for an account with no wallet", async () => {
    const read = await getWalletByCommanderId(commanderB);
    expect(read).toBeNull();
  });

  it("TC-001.5 rejects negative values (validation, no negative row persisted)", async () => {
    await expect(
      upsertWallet(commanderB, { gold: -1, cores: 0 }),
    ).rejects.toBeInstanceOf(WalletValidationError);

    // The DB CHECK constraint also rejects a direct negative write.
    await expect(
      prisma.commanderWallet.create({
        data: { commanderId: commanderB, gold: -1, cores: 0 },
      }),
    ).rejects.toThrow();

    // No wallet was created for B.
    const read = await getWalletByCommanderId(commanderB);
    expect(read).toBeNull();
  });
});

describe("validateWalletInput", () => {
  it("accepts non-negative integers", () => {
    expect(validateWalletInput({ gold: 0, cores: 10 })).toEqual({
      gold: 0,
      cores: 10,
    });
  });

  it("rejects negatives, non-integers, and non-numbers", () => {
    expect(() => validateWalletInput({ gold: -1, cores: 0 })).toThrow(
      WalletValidationError,
    );
    expect(() => validateWalletInput({ gold: 1.5, cores: 0 })).toThrow(
      WalletValidationError,
    );
    expect(() => validateWalletInput({ gold: "abc", cores: 0 })).toThrow(
      WalletValidationError,
    );
    expect(() => validateWalletInput({ gold: NaN, cores: 0 })).toThrow(
      WalletValidationError,
    );
  });
});
