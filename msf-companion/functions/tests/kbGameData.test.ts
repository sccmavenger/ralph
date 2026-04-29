import { describe, it, expect } from "vitest";
import {
  generateCharacterKitDoc,
  generateTeamMetaDoc,
  generateDDNodeDoc,
  generateISO8Doc,
  generateGearDoc,
} from "../src/lib/kbGameData.js";

describe("kbGameData", () => {
  describe("generateCharacterKitDoc", () => {
    it("generates a correctly shaped document with required fields", () => {
      const doc = generateCharacterKitDoc({
        id: "wolverine",
        name: "Wolverine",
        traits: ["Mutant", "Hero", "X-Men", "Brawler"],
        abilities: [
          { name: "Adamantium Slash", description: "Attack primary target" },
          { name: "Healing Factor", description: "Regenerate health each turn" },
        ],
        teams: ["X-Men", "Weapon X"],
      });

      expect(doc.id).toBe("api-char-wolverine");
      expect(doc.category).toBe("character-kits");
      expect(doc.sourceCreatorName).toBe("MSF API (Official)");
      expect(doc.sourceTier).toBe(1);
      expect(doc.sourceType).toBe("api-game-data");
      expect(doc.content).toContain("Wolverine");
      expect(doc.content).toContain("Mutant");
      expect(doc.content).toContain("X-Men");
      expect(doc.content).toContain("Adamantium Slash");
      expect(doc.content.length).toBeGreaterThan(100);
    });

    it("handles characters with no team affiliations", () => {
      const doc = generateCharacterKitDoc({
        id: "minion-1",
        name: "Hydra Minion",
        traits: ["Villain", "Hydra"],
        abilities: [{ name: "Strike", description: "Basic attack" }],
        teams: [],
      });

      expect(doc.content).toContain("No specific team");
    });
  });

  describe("generateTeamMetaDoc", () => {
    it("generates a correctly shaped meta document", () => {
      const doc = generateTeamMetaDoc(
        {
          characters: ["Apocalypse", "Morgan Le Fay", "Rogue", "Gambit", "Nightcrawler"],
          totalBattles: 15000,
          wins: 12000,
          winRate: 0.8,
          rank: 1,
        },
        "war-offense"
      );

      expect(doc.id).toBe("api-meta-war-offense-1");
      expect(doc.category).toBe("war-meta");
      expect(doc.sourceTier).toBe(1);
      expect(doc.sourceType).toBe("api-game-data");
      expect(doc.content).toContain("80.0%");
      expect(doc.content).toContain("15000");
      expect(doc.content).toContain("Apocalypse");
      expect(doc.content).toContain("war-offense");
    });
  });

  describe("generateDDNodeDoc", () => {
    it("generates a correctly shaped DD node document", () => {
      const doc = generateDDNodeDoc(
        { id: "dd7", name: "Dark Dimension 7" },
        {
          id: "node-10",
          nodeNumber: 10,
          section: "Cosmic",
          requiredTraits: ["Cosmic", "Mystic"],
          enemies: [
            { name: "Thanos", power: 500000 },
            { name: "Proxima Midnight", power: 450000 },
          ],
        }
      );

      expect(doc.id).toBe("api-dd-dd7-node-10");
      expect(doc.category).toBe("dark-dimension");
      expect(doc.sourceTier).toBe(1);
      expect(doc.content).toContain("Dark Dimension 7");
      expect(doc.content).toContain("Node 10");
      expect(doc.content).toContain("Cosmic");
      expect(doc.content).toContain("Thanos");
      expect(doc.content).toContain("500000");
    });

    it("handles nodes with no trait requirements", () => {
      const doc = generateDDNodeDoc(
        { id: "dd5", name: "Dark Dimension 5" },
        {
          id: "node-1",
          nodeNumber: 1,
          section: "Global",
          requiredTraits: [],
          enemies: [{ name: "Enemy 1" }],
        }
      );

      expect(doc.content).toContain("No specific trait requirements");
    });
  });

  describe("generateISO8Doc", () => {
    it("generates a correctly shaped ISO-8 document", () => {
      const doc = generateISO8Doc("Wolverine", {
        topClass: "Skirmisher",
        topClassPercent: 78.5,
        runnerUps: [
          { className: "Raider", percent: 15.2 },
          { className: "Striker", percent: 6.3 },
        ],
      });

      expect(doc.id).toBe("api-iso8-wolverine");
      expect(doc.category).toBe("iso-8");
      expect(doc.sourceTier).toBe(1);
      expect(doc.content).toContain("Wolverine");
      expect(doc.content).toContain("Skirmisher");
      expect(doc.content).toContain("78.5%");
      expect(doc.content).toContain("Raider");
      expect(doc.content).toContain("30 days of game data");
    });

    it("handles characters with spaces in name", () => {
      const doc = generateISO8Doc("Captain America", {
        topClass: "Fortifier",
        topClassPercent: 65.0,
        runnerUps: [],
      });

      expect(doc.id).toBe("api-iso8-captain-america");
    });
  });

  describe("generateGearDoc", () => {
    it("generates a correctly shaped gear document", () => {
      const doc = generateGearDoc("Wolverine", 18, 19, [
        { name: "Adamantium Claw", quantity: 12, farmable: true },
        { name: "Alien Spores", quantity: 8, farmable: false },
        { name: "Vibranium", quantity: 4, farmable: true },
      ]);

      expect(doc.id).toBe("api-gear-tier-19-wolverine");
      expect(doc.category).toBe("gear-guide");
      expect(doc.sourceTier).toBe(1);
      expect(doc.content).toContain("Wolverine");
      expect(doc.content).toContain("Gear Tier 18 to 19");
      expect(doc.content).toContain("Adamantium Claw x12");
      expect(doc.content).toContain("(farmable)");
      expect(doc.content).toContain("(unfarmable)");
      expect(doc.content).toContain("Farmable items: 2");
      expect(doc.content).toContain("Unfarmable items: 1");
    });
  });
});
