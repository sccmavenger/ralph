import { describe, it, expect, beforeEach } from "vitest";
import {
  SAFETY_MARGIN_DEFAULT,
  SAFETY_MARGIN_MAX,
  SAFETY_MARGIN_MIN,
  clampSafetyMargin,
  loadSafetyMargin,
  saveSafetyMargin,
  clearOtherEventMargins,
  type MarginStorage,
} from "./tower-margin-storage";

// Tiny in-memory MarginStorage shim so tests don't depend on jsdom/localStorage.
function makeStorage(initial: Record<string, string> = {}): MarginStorage & {
  data: Map<string, string>;
} {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    get length() {
      return data.size;
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null;
    },
  };
}

describe("tower-margin-storage", () => {
  let storage: ReturnType<typeof makeStorage>;
  beforeEach(() => {
    storage = makeStorage();
  });

  describe("clampSafetyMargin", () => {
    it("returns default for NaN / Infinity", () => {
      expect(clampSafetyMargin(NaN)).toBe(SAFETY_MARGIN_DEFAULT);
      expect(clampSafetyMargin(Infinity)).toBe(SAFETY_MARGIN_MAX);
    });
    it("clamps below MIN up to MIN", () => {
      expect(clampSafetyMargin(0.5)).toBe(SAFETY_MARGIN_MIN);
    });
    it("clamps above MAX down to MAX", () => {
      expect(clampSafetyMargin(2.0)).toBe(SAFETY_MARGIN_MAX);
    });
    it("snaps to nearest 0.05 step", () => {
      expect(clampSafetyMargin(1.13)).toBe(1.15);
      expect(clampSafetyMargin(1.12)).toBe(1.1);
      expect(clampSafetyMargin(1.27)).toBe(1.25);
    });
  });

  describe("loadSafetyMargin", () => {
    it("returns default when key is missing", () => {
      expect(loadSafetyMargin("evt1", storage)).toBe(SAFETY_MARGIN_DEFAULT);
    });
    it("returns default when towerEventId is empty", () => {
      expect(loadSafetyMargin("", storage)).toBe(SAFETY_MARGIN_DEFAULT);
      expect(loadSafetyMargin(null, storage)).toBe(SAFETY_MARGIN_DEFAULT);
    });
    it("returns default when storage is null", () => {
      expect(loadSafetyMargin("evt1", null)).toBe(SAFETY_MARGIN_DEFAULT);
    });
    it("returns default when value is non-numeric", () => {
      storage.setItem("tower-planner-margin:evt1", "not-a-number");
      expect(loadSafetyMargin("evt1", storage)).toBe(SAFETY_MARGIN_DEFAULT);
    });
    it("returns the persisted (clamped) value", () => {
      storage.setItem("tower-planner-margin:evt1", "1.25");
      expect(loadSafetyMargin("evt1", storage)).toBe(1.25);
    });
    it("clamps out-of-range persisted values on read", () => {
      storage.setItem("tower-planner-margin:evt1", "5.0");
      expect(loadSafetyMargin("evt1", storage)).toBe(SAFETY_MARGIN_MAX);
    });
  });

  describe("saveSafetyMargin", () => {
    it("writes the clamped value under the event-scoped key", () => {
      saveSafetyMargin("evt1", 1.23, storage);
      // 1.23 snaps to 1.25.
      expect(storage.getItem("tower-planner-margin:evt1")).toBe("1.25");
    });
    it("is a no-op when towerEventId is empty", () => {
      saveSafetyMargin("", 1.3, storage);
      expect(storage.data.size).toBe(0);
    });
    it("is a no-op when storage is null", () => {
      expect(() => saveSafetyMargin("evt1", 1.3, null)).not.toThrow();
    });
    it("read-after-write round-trips", () => {
      saveSafetyMargin("evt1", 1.3, storage);
      expect(loadSafetyMargin("evt1", storage)).toBe(1.3);
    });
  });

  describe("clearOtherEventMargins", () => {
    it("removes margin keys for other events but keeps the current one", () => {
      storage.setItem("tower-planner-margin:evt1", "1.10");
      storage.setItem("tower-planner-margin:evt2", "1.30");
      storage.setItem("tower-planner-margin:evt3", "1.20");
      storage.setItem("some-other-key", "leave-me");

      clearOtherEventMargins("evt2", storage);

      expect(storage.getItem("tower-planner-margin:evt1")).toBeNull();
      expect(storage.getItem("tower-planner-margin:evt2")).toBe("1.30");
      expect(storage.getItem("tower-planner-margin:evt3")).toBeNull();
      expect(storage.getItem("some-other-key")).toBe("leave-me");
    });
    it("removes ALL margin keys when currentEventId is empty", () => {
      storage.setItem("tower-planner-margin:evt1", "1.10");
      storage.setItem("tower-planner-margin:evt2", "1.30");

      clearOtherEventMargins(null, storage);

      expect(storage.getItem("tower-planner-margin:evt1")).toBeNull();
      expect(storage.getItem("tower-planner-margin:evt2")).toBeNull();
    });
  });
});
