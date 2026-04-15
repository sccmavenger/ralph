"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import UpgradePathView from "./UpgradePathView";
import { DetailStars } from "./StarDisplay";
import { CharPortrait } from "./CharPortrait";

/**
 * Parse MSF ability description color tags like <color=#86e619>140%</color>
 * into styled React elements.
 */
function parseColorTags(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const regex = /<color=(#[0-9a-fA-F]{3,8})>(.*?)<\/color>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={key++} style={{ color: match[1] }}>
        {match[2]}
      </span>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 && typeof parts[0] === "string" ? text : <>{parts}</>;
}

interface AbilityLevel {
  level: number;
  description?: string;
  nextUpgrade?: string;
  energyCost?: number;
  startingEnergy?: number;
  upgradeMaterials?: { name: string; quantity: number }[];
}

interface Ability {
  id: string;
  name: string;
  type: string;
  icon?: string;
  currentLevel?: number;
  maxLevel?: number;
  description?: string;
  levels?: AbilityLevel[];
  energyCost?: number;
  startingEnergy?: number;
}

interface AbilityKit {
  basic?: Ability;
  special?: Ability;
  ultimate?: Ability;
  passive?: Ability;
}

interface CharacterDetail {
  id: string;
  name: string;
  portrait?: string;
  yellowStars?: number;
  redStars?: number;
  gearTier?: number;
  level?: number;
  power?: number;
  iso8?: { class?: string; level?: number };
  traits?: string[];
  abilityKit?: AbilityKit | Record<string, unknown>;
  empoweredAbilityKit?: AbilityKit | Record<string, unknown>;
}

interface CharacterApiResponse {
  data?: CharacterDetail;
  error?: string;
}

// Transform raw API ability (object-keyed levels) into our component's Ability interface
function transformAbility(
  raw: Record<string, unknown>,
  type: string
): Ability {
  const rawLevels = raw.levels as Record<string, Record<string, unknown>> | undefined;
  const levels: AbilityLevel[] = rawLevels
    ? Object.entries(rawLevels)
        .map(([key, val]) => ({
          level: parseInt(key, 10),
          description: (val.description as string) ?? undefined,
          nextUpgrade: (val.nextUpgrade as string) ?? undefined,
          energyCost: (val.costEnergy as number) ?? undefined,
          startingEnergy: (val.startEnergy as number) ?? undefined,
          upgradeMaterials: Array.isArray(val.nextUpgradeCosts)
            ? (val.nextUpgradeCosts as { item?: { name?: string }; id?: string; quantity?: number }[]).map(
                (c) => ({
                  name: c.item?.name ?? (c.id as string) ?? "Unknown",
                  quantity: (c.quantity as number) ?? 1,
                })
              )
            : undefined,
        }))
        .sort((a, b) => a.level - b.level)
    : [];

  const maxLevel = levels.length > 0 ? Math.max(...levels.map((l) => l.level)) : undefined;
  const firstLevel = levels[0];

  return {
    id: type,
    name: (raw.name as string) ?? type.charAt(0).toUpperCase() + type.slice(1),
    type,
    icon: (raw.icon as string) ?? undefined,
    maxLevel,
    description: firstLevel?.description,
    levels: levels.length > 0 ? levels : undefined,
    energyCost: firstLevel?.energyCost,
    startingEnergy: firstLevel?.startingEnergy,
  };
}

function transformAbilityKit(
  raw: Record<string, unknown>
): AbilityKit {
  const kit: AbilityKit = {};
  if (raw.basic) kit.basic = transformAbility(raw.basic as Record<string, unknown>, "basic");
  if (raw.special) kit.special = transformAbility(raw.special as Record<string, unknown>, "special");
  if (raw.ultimate) kit.ultimate = transformAbility(raw.ultimate as Record<string, unknown>, "ultimate");
  if (raw.passive) kit.passive = transformAbility(raw.passive as Record<string, unknown>, "passive");
  return kit;
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-4 px-4 py-6">
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 rounded-full bg-[var(--color-surface-light)]" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-2/3 rounded bg-[var(--color-surface-light)]" />
          <div className="h-4 w-1/2 rounded bg-[var(--color-surface-light)]" />
        </div>
      </div>
      <div className="h-24 rounded-xl bg-[var(--color-surface-light)]" />
      <div className="h-24 rounded-xl bg-[var(--color-surface-light)]" />
      <div className="h-24 rounded-xl bg-[var(--color-surface-light)]" />
    </div>
  );
}

function AbilityCard({ ability }: { ability: Ability }) {
  const [expanded, setExpanded] = useState(false);

  const typeLabel: Record<string, string> = {
    basic: "Basic",
    special: "Special",
    ultimate: "Ultimate",
    passive: "Passive",
  };

  return (
    <div className="rounded-xl bg-[var(--color-surface)] p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="text-sm font-semibold text-[var(--color-foreground)]">
            {ability.name}
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            {typeLabel[ability.type] ?? ability.type}
            {ability.maxLevel != null && ` • Max Lv ${ability.maxLevel}`}
            {ability.energyCost != null && ` • ${ability.energyCost} Energy`}
            {ability.startingEnergy != null &&
              ` • Start: ${ability.startingEnergy}`}
          </p>
        </div>
        <span
          className="text-[var(--color-muted)] transition-transform"
          style={{ transform: expanded ? "rotate(180deg)" : "none" }}
        >
          ▾
        </span>
      </button>

      {ability.description && (
        <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted)]">
          {parseColorTags(ability.description)}
        </p>
      )}

      {/* Expanded: all levels */}
      {expanded && ability.levels && (
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto border-t border-[var(--color-surface-light)] pt-3">
          {ability.levels.map((lvl) => (
            <div
              key={lvl.level}
              className="rounded-lg bg-[var(--color-background)] p-2 text-xs"
            >
              <p className="font-medium text-[var(--color-foreground)]">
                Level {lvl.level}
              </p>
              <p className="mt-0.5 text-[var(--color-muted)]">
                {lvl.description ? parseColorTags(lvl.description) : "—"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AbilityKitSection({
  title,
  kit,
}: {
  title: string;
  kit: AbilityKit;
}) {
  const abilities = [kit.basic, kit.special, kit.ultimate, kit.passive].filter(
    Boolean
  ) as Ability[];

  if (abilities.length === 0) return null;

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-bold text-[var(--color-foreground)]">
        {title}
      </h3>
      <div className="space-y-2">
        {abilities.map((a) => (
          <AbilityCard key={a.id} ability={a} />
        ))}
      </div>
    </div>
  );
}

export default function CharacterDetailView({
  characterId,
  rosterData,
  onBack,
}: {
  characterId: string;
  rosterData?: {
    yellowStars?: number;
    redStars?: number;
    gearTier?: number;
    level?: number;
    power?: number;
  };
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<CharacterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/msf/characters/${characterId}`);
      if (!res.ok) {
        const data = (await res.json()) as CharacterApiResponse;
        throw new Error(data.error || "Failed to load character");
      }

      const data = (await res.json()) as CharacterApiResponse;
      const charData = data.data ?? null;

      // Transform ability kits from API format (object-keyed levels) to component format
      if (charData) {
        if (charData.abilityKit && typeof charData.abilityKit === "object") {
          charData.abilityKit = transformAbilityKit(
            charData.abilityKit as Record<string, unknown>
          );
        }
        if (charData.empoweredAbilityKit && typeof charData.empoweredAbilityKit === "object") {
          charData.empoweredAbilityKit = transformAbilityKit(
            charData.empoweredAbilityKit as Record<string, unknown>
          );
        }
      }

      setDetail(charData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchDetail();
    }
  }, [fetchDetail]);

  if (loading) return <DetailSkeleton />;

  if (error) {
    return (
      <div className="px-4 py-6">
        <button
          onClick={onBack}
          className="mb-4 text-xs text-[var(--color-accent)] hover:underline"
        >
          ← Back
        </button>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="mb-4 text-sm text-[var(--color-muted)]">{error}</p>
          <button
            onClick={() => {
              fetchedRef.current = false;
              fetchDetail();
            }}
            className="rounded-lg bg-[var(--color-accent)] px-6 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!detail) return null;

  const stars = rosterData ?? detail;

  return (
    <div className="px-4 py-4">
      <button
        onClick={onBack}
        className="mb-4 text-xs text-[var(--color-accent)] hover:underline"
      >
        ← Back
      </button>

      {/* Character header */}
      <div className="mb-4 flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-surface)]">
          <CharPortrait
            src={detail.portrait}
            name={detail.name ?? "?"}
            imgClassName="h-full w-full object-cover"
            fallbackClassName="flex h-full w-full items-center justify-center text-2xl font-bold text-[var(--color-muted)]"
          />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--color-foreground)]">
            {detail.name}
          </h2>
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <DetailStars yellowStars={stars.yellowStars} redStars={stars.redStars} />
          </div>
          <div className="mt-1 flex gap-3 text-xs text-[var(--color-muted)]">
            {stars.gearTier != null && <span>G{stars.gearTier}</span>}
            {stars.level != null && <span>Lv {stars.level}</span>}
            {stars.power != null && (
              <span className="font-bold text-[var(--color-accent)]">
                {stars.power.toLocaleString()} Power
              </span>
            )}
          </div>
          {detail.iso8 && (
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              ISO-8: {detail.iso8.class ?? "—"} Lv {detail.iso8.level ?? 0}
            </p>
          )}
        </div>
      </div>

      {/* Traits */}
      {detail.traits && detail.traits.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {detail.traits.map((trait) => (
            <span
              key={trait}
              className="rounded-full bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-muted)]"
            >
              {trait}
            </span>
          ))}
        </div>
      )}

      {/* Abilities */}
      {detail.abilityKit && (
        <AbilityKitSection title="Abilities" kit={detail.abilityKit as AbilityKit} />
      )}

      {detail.empoweredAbilityKit && (
        <AbilityKitSection
          title="Empowered Abilities"
          kit={detail.empoweredAbilityKit as AbilityKit}
        />
      )}

      {/* Upgrade Path */}
      {stars.gearTier != null && (
        <UpgradePathView
          characterId={detail.id}
          gearTier={stars.gearTier}
        />
      )}
    </div>
  );
}
