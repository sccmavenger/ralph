import { describe, it, expect, beforeEach } from "vitest";
import {
  OUTCOMES_STORAGE_KEY,
  OUTCOMES_MAX_STORED,
  OUTCOMES_WINDOW,
  OUTCOMES_MIN_FOR_SUGGESTION,
  type OutcomeEntry,
  type OutcomeStorage,
  loadOutcomes,
  recordOutcome,
  clearOutcomes,
  tallyOutcomes,
  generateMarginSuggestion,
} from "./tower-outcome-storage";

function makeStorage(initial: Record<string, string> = {}): OutcomeStorage & {
  data: Map<string, string>;
} {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

function mkEntry(
  outcome: OutcomeEntry["outcome"],
  overrides: Partial<OutcomeEntry> = {},
): OutcomeEntry {
  return {
    towerEventId: "evt-1",
    roomId: "r1",
    outcome,
    recommendedTeam: ["c1", "c2"],
    opponentPower: 100_000,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("tower-outcome-storage — storage", () => {
  let storage: ReturnType<typeof makeStorage>;
  beforeEach(() => {
    storage = makeStorage();
  });

  it("loadOutcomes returns [] when key missing", () => {
    expect(loadOutcomes(storage)).toEqual([]);
  });

  it("loadOutcomes returns [] when JSON is malformed", () => {
    storage.setItem(OUTCOMES_STORAGE_KEY, "{not json");
    expect(loadOutcomes(storage)).toEqual([]);
  });

  it("loadOutcomes filters out malformed entries", () => {
    const valid = mkEntry("wonEasily");
    storage.setItem(
      OUTCOMES_STORAGE_KEY,
      JSON.stringify([valid, { bogus: true }, null, "string"]),
    );
    expect(loadOutcomes(storage)).toEqual([valid]);
  });

  it("recordOutcome appends and persists", () => {
    const a = mkEntry("wonEasily", { roomId: "r1" });
    const b = mkEntry("lost", { roomId: "r2" });
    recordOutcome(a, storage);
    const after = recordOutcome(b, storage);
    expect(after).toEqual([a, b]);
    expect(loadOutcomes(storage)).toEqual([a, b]);
  });

  it("recordOutcome trims to OUTCOMES_MAX_STORED keeping most recent", () => {
    for (let i = 0; i < OUTCOMES_MAX_STORED + 5; i++) {
      recordOutcome(mkEntry("wonBarely", { roomId: `r${i}`, timestamp: i }), storage);
    }
    const list = loadOutcomes(storage);
    expect(list).toHaveLength(OUTCOMES_MAX_STORED);
    expect(list[0].timestamp).toBe(5); // first 5 dropped
    expect(list[list.length - 1].timestamp).toBe(OUTCOMES_MAX_STORED + 4);
  });

  it("clearOutcomes removes the key", () => {
    recordOutcome(mkEntry("lost"), storage);
    clearOutcomes(storage);
    expect(loadOutcomes(storage)).toEqual([]);
  });

  it("loadOutcomes returns [] when storage is null", () => {
    expect(loadOutcomes(null)).toEqual([]);
  });

  it("recordOutcome is a no-op for storage but still returns updated list when storage is null", () => {
    const e = mkEntry("wonBarely");
    expect(recordOutcome(e, null)).toEqual([e]);
  });
});

describe("tower-outcome-storage — tally", () => {
  it("returns zeros for empty input", () => {
    const t = tallyOutcomes([]);
    expect(t).toEqual({
      total: 0,
      wonEasily: 0,
      wonBarely: 0,
      lost: 0,
      lostPct: 0,
      wonEasilyPct: 0,
    });
  });

  it("counts and computes pcts correctly", () => {
    const list: OutcomeEntry[] = [
      mkEntry("wonEasily"),
      mkEntry("wonEasily"),
      mkEntry("wonBarely"),
      mkEntry("lost"),
    ];
    const t = tallyOutcomes(list);
    expect(t.total).toBe(4);
    expect(t.wonEasily).toBe(2);
    expect(t.wonBarely).toBe(1);
    expect(t.lost).toBe(1);
    expect(t.lostPct).toBe(25);
    expect(t.wonEasilyPct).toBe(50);
  });

  it("only considers the last `windowSize` entries", () => {
    const old = Array.from({ length: 30 }, () => mkEntry("lost"));
    const recent = Array.from({ length: 5 }, () => mkEntry("wonEasily"));
    const t = tallyOutcomes([...old, ...recent], OUTCOMES_WINDOW);
    // Window=20: last 20 = 5 wonEasily + 15 lost
    expect(t.total).toBe(20);
    expect(t.wonEasily).toBe(5);
    expect(t.lost).toBe(15);
  });
});

describe("tower-outcome-storage — generateMarginSuggestion", () => {
  it("returns null when below minimum sample size", () => {
    const list = Array.from({ length: OUTCOMES_MIN_FOR_SUGGESTION - 1 }, () =>
      mkEntry("lost"),
    );
    expect(generateMarginSuggestion(list, 1.1)).toBeNull();
  });

  it("suggests +0.10 when lost pct >= 20%", () => {
    // 2 losses out of 10 = 20%
    const list: OutcomeEntry[] = [
      ...Array.from({ length: 8 }, () => mkEntry("wonBarely")),
      mkEntry("lost"),
      mkEntry("lost"),
    ];
    const sugg = generateMarginSuggestion(list, 1.1);
    expect(sugg).not.toBeNull();
    expect(sugg!.suggestedMargin).toBeCloseTo(1.2, 5);
    expect(sugg!.text).toContain("Suggested: 1.20x");
    expect(sugg!.text).toContain("at 1.10x");
    expect(sugg!.text).toContain("lost 20%");
    expect(sugg!.text).toContain("last 10 fights");
  });

  it("suggests -0.05 when all wins and >=70% won easily over >=10 fights", () => {
    const list: OutcomeEntry[] = [
      ...Array.from({ length: 8 }, () => mkEntry("wonEasily")),
      mkEntry("wonBarely"),
      mkEntry("wonBarely"),
    ];
    const sugg = generateMarginSuggestion(list, 1.2);
    expect(sugg).not.toBeNull();
    expect(sugg!.suggestedMargin).toBeCloseTo(1.15, 5);
    expect(sugg!.text).toContain("Suggested: 1.15x");
    expect(sugg!.text).toContain("won easily 80%");
  });

  it("does NOT suggest lower with fewer than 10 fights even if all easy", () => {
    const list = Array.from({ length: 9 }, () => mkEntry("wonEasily"));
    expect(generateMarginSuggestion(list, 1.2)).toBeNull();
  });

  it("returns null when current margin already at MAX and we'd suggest higher", () => {
    const list: OutcomeEntry[] = Array.from({ length: 10 }, () => mkEntry("lost"));
    expect(generateMarginSuggestion(list, 1.5)).toBeNull();
  });

  it("returns null when current margin already at MIN and we'd suggest lower", () => {
    const list = Array.from({ length: 12 }, () => mkEntry("wonEasily"));
    expect(generateMarginSuggestion(list, 1.0)).toBeNull();
  });

  it("returns null for healthy mix (no nudge needed)", () => {
    // 10 fights, 1 loss = 10% loss, 4 wonEasily = 40% -> no suggestion either way
    const list: OutcomeEntry[] = [
      ...Array.from({ length: 4 }, () => mkEntry("wonEasily")),
      ...Array.from({ length: 5 }, () => mkEntry("wonBarely")),
      mkEntry("lost"),
    ];
    expect(generateMarginSuggestion(list, 1.1)).toBeNull();
  });
});
