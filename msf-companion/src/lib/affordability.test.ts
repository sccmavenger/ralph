import { describe, it, expect } from "vitest";
import { computeAffordability, ApiBalances } from "./affordability";
import type { CostBundle } from "./cost-bundle";
import type { WalletInput } from "./wallet";

/**
 * US-006 affordability comparison tests (TC-006.1 .. TC-006.6).
 *
 * The function is pure: it compares a CostBundle (US-005) against a wallet
 * (gold/cores, possibly absent) and API balances (mats + training XP).
 */

const bundle: CostBundle = {
  gold: 1_000_000,
  cores: 50,
  abilityMats: { GEAR_A: 10, MAT_B: 4 },
  trainingXp: 100_000,
};

const wallet: WalletInput = { gold: 2_000_000, cores: 100 };

const api: ApiBalances = {
  abilityMats: { GEAR_A: 20, MAT_B: 8 },
  trainingXp: 500_000,
};

describe("computeAffordability (US-006)", () => {
  it("TC-006.1 — fully affordable: every have >= required", () => {
    const r = computeAffordability(bundle, wallet, api);

    expect(r.gold.short).toBe(0);
    expect(r.cores.short).toBe(0);
    expect(r.trainingXp.short).toBe(0);
    expect(r.abilityMats.GEAR_A.short).toBe(0);
    expect(r.abilityMats.MAT_B.short).toBe(0);
    expect(r.affordable).toBe(true);
    expect(r.verdict).toBe("affordable");
  });

  it("TC-006.2 — short on one resource: correct short amount, only gold flagged", () => {
    const poorWallet: WalletInput = { gold: 600_000, cores: 100 };
    const r = computeAffordability(bundle, poorWallet, api);

    // gold short = required - have = 1,000,000 - 600,000
    expect(r.gold.status).toBe("short");
    expect(r.gold.short).toBe(400_000);

    // nothing else is short
    expect(r.cores.status).toBe("ok");
    expect(r.trainingXp.status).toBe("ok");
    expect(r.abilityMats.GEAR_A.status).toBe("ok");
    expect(r.abilityMats.MAT_B.status).toBe("ok");

    expect(r.affordable).toBe(false);
    expect(r.verdict).toBe("short");
  });

  it("TC-006.3 — no wallet: gold/cores unknown (not short), verdict wallet-needed, mats/XP still evaluated", () => {
    const r = computeAffordability(bundle, null, api);

    expect(r.gold.status).toBe("unknown");
    expect(r.gold.have).toBeNull();
    expect(r.gold.short).toBe(0);
    expect(r.cores.status).toBe("unknown");
    expect(r.cores.have).toBeNull();
    expect(r.cores.short).toBe(0);

    // mats/XP from the API are STILL evaluated (here they are sufficient)
    expect(r.trainingXp.status).toBe("ok");
    expect(r.abilityMats.GEAR_A.status).toBe("ok");
    expect(r.abilityMats.MAT_B.status).toBe("ok");

    // not a false negative purely from a missing wallet
    expect(r.affordable).not.toBe(false);
    expect(r.verdict).toBe("wallet-needed");
  });

  it("TC-006.3b — no wallet but a mat IS short: verdict short, not wallet-needed", () => {
    const poorApi: ApiBalances = {
      abilityMats: { GEAR_A: 3, MAT_B: 8 },
      trainingXp: 500_000,
    };
    const r = computeAffordability(bundle, null, poorApi);

    expect(r.gold.status).toBe("unknown");
    expect(r.abilityMats.GEAR_A.status).toBe("short");
    expect(r.abilityMats.GEAR_A.short).toBe(7); // 10 - 3
    expect(r.affordable).toBe(false);
    expect(r.verdict).toBe("short");
  });

  it("TC-006.4 — exact-match boundary: have == required is affordable (>= inclusive)", () => {
    const exactWallet: WalletInput = { gold: 1_000_000, cores: 50 };
    const exactApi: ApiBalances = {
      abilityMats: { GEAR_A: 10, MAT_B: 4 },
      trainingXp: 100_000,
    };
    const r = computeAffordability(bundle, exactWallet, exactApi);

    expect(r.gold.short).toBe(0);
    expect(r.gold.status).toBe("ok");
    expect(r.cores.status).toBe("ok");
    expect(r.trainingXp.status).toBe("ok");
    expect(r.abilityMats.GEAR_A.status).toBe("ok");
    expect(r.abilityMats.MAT_B.status).toBe("ok");
    expect(r.affordable).toBe(true);
    expect(r.verdict).toBe("affordable");
  });

  it("TC-006.5 — zero-cost bundle: affordable regardless of wallet presence", () => {
    const empty: CostBundle = {
      gold: 0,
      cores: 0,
      abilityMats: {},
      trainingXp: 0,
    };
    const emptyApi: ApiBalances = { abilityMats: {}, trainingXp: 0 };

    const withWallet = computeAffordability(empty, wallet, emptyApi);
    expect(withWallet.affordable).toBe(true);
    expect(withWallet.verdict).toBe("affordable");

    const withoutWallet = computeAffordability(empty, null, emptyApi);
    expect(withoutWallet.affordable).toBe(true);
    // no currency is actually required, so nothing is unknown
    expect(withoutWallet.gold.status).toBe("ok");
    expect(withoutWallet.cores.status).toBe("ok");
    expect(withoutWallet.verdict).toBe("affordable");
  });

  it("TC-006.6 — purity: no side effects, deterministic for identical inputs", () => {
    const frozenBundle: CostBundle = {
      gold: 1_000_000,
      cores: 50,
      abilityMats: { GEAR_A: 10 },
      trainingXp: 100_000,
    };
    const frozenWallet: WalletInput = { gold: 2_000_000, cores: 100 };
    const frozenApi: ApiBalances = {
      abilityMats: { GEAR_A: 20 },
      trainingXp: 500_000,
    };

    const snapshotBundle = JSON.stringify(frozenBundle);
    const snapshotWallet = JSON.stringify(frozenWallet);
    const snapshotApi = JSON.stringify(frozenApi);

    const a = computeAffordability(frozenBundle, frozenWallet, frozenApi);
    const b = computeAffordability(frozenBundle, frozenWallet, frozenApi);

    // identical output for identical input
    expect(a).toEqual(b);

    // inputs were not mutated
    expect(JSON.stringify(frozenBundle)).toBe(snapshotBundle);
    expect(JSON.stringify(frozenWallet)).toBe(snapshotWallet);
    expect(JSON.stringify(frozenApi)).toBe(snapshotApi);
  });
});
