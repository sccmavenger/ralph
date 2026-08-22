import type { CombatWave, EnemyCombat, EnemyUnit } from "@/lib/dd-service";

export interface StrategyTarget {
  id: string;
  name: string;
  wave: number;
  reason: string;
}

export interface DDNodeStrategy {
  targetPriorities: StrategyTarget[];
  openingPlan: string;
  wavePlan: string[];
  dataNote: string;
}

interface IndexedWave extends CombatWave {
  wave: number;
}

function traitId(trait: string | { id: string }): string {
  return typeof trait === "string" ? trait : trait.id;
}

function traitsFor(unit: EnemyUnit): string[] {
  return [
    ...(unit.info?.traits ?? []),
    ...(unit.info?.invisibleTraits ?? []),
  ].map((trait) => traitId(trait).toLowerCase());
}

function unitName(unit: EnemyUnit): string {
  return unit.info?.name?.trim() || unit.id;
}

function unitPower(unit: EnemyUnit): number {
  return (
    unit.stats?.power ??
    (unit.level ?? 1) * Math.max(1, unit.gearTier ?? 1) * 100
  );
}

function indexedWaves(combat?: EnemyCombat): IndexedWave[] {
  const waves: IndexedWave[] = [];
  for (const side of [combat?.left, combat?.right]) {
    for (const wave of side?.waves ?? []) {
      waves.push({ ...wave, wave: waves.length + 1 });
    }
  }
  return waves;
}

function threatReason(
  unit: EnemyUnit,
  maxPower: number,
): {
  score: number;
  reason: string;
} {
  const traits = traitsFor(unit);
  const reasons: string[] = [];
  let score = maxPower > 0 ? (unitPower(unit) / maxPower) * 30 : 0;

  if (traits.includes("support")) {
    score += 45;
    reasons.push("support or sustain role");
  }
  if (traits.includes("controller")) {
    score += 40;
    reasons.push("control role");
  }
  if (traits.includes("protector")) {
    score += 15;
    reasons.push("protection role");
  }
  if (traits.includes("blaster") || traits.includes("brawler")) {
    score += 10;
    reasons.push("damage role");
  }
  if (unit.iso8?.active?.toLowerCase() === "healer") {
    score += 15;
    reasons.push("Healer ISO-8");
  }

  if (unitPower(unit) >= maxPower && maxPower > 0) {
    reasons.push("highest listed power in its wave");
  }

  return {
    score,
    reason:
      reasons.length > 0 ? reasons.join("; ") : "highest listed node stats",
  };
}

/**
 * Produce node-specific, factual starting guidance from the live composition.
 * It intentionally avoids claims about passives or counters that are absent
 * from the node payload.
 */
export function buildDDNodeStrategy(combat?: EnemyCombat): DDNodeStrategy {
  const waves = indexedWaves(combat);
  if (waves.length === 0) {
    return {
      targetPriorities: [],
      openingPlan:
        "Enemy composition is unavailable, so a responsible target order cannot be generated yet.",
      wavePlan: [],
      dataNote:
        "Strategy guidance requires the live enemy composition and wave triggers.",
    };
  }

  const targetPriorities: StrategyTarget[] = [];
  for (const wave of waves) {
    const maxPower = Math.max(0, ...wave.units.map(unitPower));
    const seen = new Set<string>();
    const ranked = wave.units
      .map((unit) => ({ unit, ...threatReason(unit, maxPower) }))
      .sort((a, b) => b.score - a.score);

    for (const entry of ranked) {
      if (seen.has(entry.unit.id)) continue;
      seen.add(entry.unit.id);
      targetPriorities.push({
        id: entry.unit.id,
        name: unitName(entry.unit),
        wave: wave.wave,
        reason: entry.reason,
      });
      if (seen.size === 2) break;
    }
  }

  const firstTarget = targetPriorities.find((target) => target.wave === 1);
  const openingPlan = firstTarget
    ? `Open on ${firstTarget.name}. If your squad has Stun or Ability Block, use it before spreading damage, then remove the listed support and control priorities first.`
    : "Focus the strongest available enemy before spreading damage.";

  const wavePlan = waves.slice(1).map((wave) => {
    const names = targetPriorities
      .filter((target) => target.wave === wave.wave)
      .map((target) => target.name)
      .join(" and ");
    const threshold =
      wave.onFewerThan != null
        ? `enters when fewer than ${wave.onFewerThan} enemies remain`
        : wave.holdNextWaveUntil != null
          ? `is held until ${wave.holdNextWaveUntil} enemies remain`
          : "has no listed spawn threshold";
    return `Wave ${wave.wave} ${threshold}. Have control abilities ready for ${names || "its highest-stat enemies"}.`;
  });

  if (waves.length > 1) {
    wavePlan.unshift(
      "When it is safe, finish a wave with basic attacks so key control and sustain abilities are ready for the next spawn.",
    );
  }

  return {
    targetPriorities,
    openingPlan,
    wavePlan,
    dataNote:
      "Generated from live roles, node stats, ISO-8, and wave triggers. It does not invent hidden passive interactions or claim a guaranteed clear.",
  };
}
