"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UpgradeMaterial {
  id: string;
  name: string;
  quantityNeeded: number;
  quantityOwned: number;
}

interface UpgradeDataItem {
  gearTier: number;
  items: { id: string; name?: string; quantity: number }[];
}

interface UpgradeApiResponse {
  data?: UpgradeDataItem[];
  error?: string;
}

interface InventoryApiResponse {
  data?: { id: string; name?: string; quantity?: number }[];
}

function UpgradePathSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-5 w-1/3 rounded bg-[var(--color-surface-light)]" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-lg bg-[var(--color-surface)] p-3"
        >
          <div className="h-4 w-1/2 rounded bg-[var(--color-surface-light)]" />
          <div className="h-4 w-20 rounded bg-[var(--color-surface-light)]" />
        </div>
      ))}
    </div>
  );
}

export default function UpgradePathView({
  characterId,
  gearTier,
}: {
  characterId: string;
  gearTier: number;
}) {
  const [materials, setMaterials] = useState<UpgradeMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMaxTier, setIsMaxTier] = useState(false);
  const fetchedRef = useRef(false);

  // Using characterId to allow future per-character upgrade data
  void characterId;

  const fetchUpgradeData = useCallback(async () => {
    setLoading(true);

    try {
      const [upgradeRes, inventoryRes] = await Promise.all([
        fetch("/api/msf/upgrade-data"),
        fetch("/api/msf/inventory"),
      ]);

      if (!upgradeRes.ok || !inventoryRes.ok) {
        setLoading(false);
        return;
      }

      const upgradeData = (await upgradeRes.json()) as UpgradeApiResponse;
      const inventoryData =
        (await inventoryRes.json()) as InventoryApiResponse;

      // Build inventory lookup
      const owned = new Map<string, number>();
      for (const item of inventoryData.data ?? []) {
        owned.set(item.id, item.quantity ?? 0);
      }

      // Find next gear tier upgrade
      const nextTier = (upgradeData.data ?? []).find(
        (d) => d.gearTier === gearTier + 1
      );

      if (!nextTier) {
        setIsMaxTier(true);
        setLoading(false);
        return;
      }

      const mats: UpgradeMaterial[] = nextTier.items.map((item) => ({
        id: item.id,
        name: item.name ?? item.id,
        quantityNeeded: item.quantity,
        quantityOwned: owned.get(item.id) ?? 0,
      }));

      setMaterials(mats);
    } catch {
      // Non-critical section
    } finally {
      setLoading(false);
    }
  }, [gearTier]);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchUpgradeData();
    }
  }, [fetchUpgradeData]);

  if (loading) return <UpgradePathSkeleton />;

  if (isMaxTier) {
    return (
      <div className="mt-4 rounded-xl bg-[var(--color-surface)] p-4 text-center">
        <p className="text-sm font-semibold text-[var(--color-accent-gold)]">
          🏆 Max Gear Tier Reached
        </p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          This character is at the highest gear tier available.
        </p>
      </div>
    );
  }

  if (materials.length === 0) return null;

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-bold text-[var(--color-foreground)]">
        Upgrade Path — Gear Tier {gearTier} → {gearTier + 1}
      </h3>
      <div className="space-y-1">
        {materials.map((mat) => {
          const sufficient = mat.quantityOwned >= mat.quantityNeeded;
          const deficit = mat.quantityNeeded - mat.quantityOwned;

          return (
            <div
              key={mat.id}
              className="flex items-center justify-between rounded-lg bg-[var(--color-surface)] px-4 py-3"
            >
              <div className="flex items-center gap-2">
                {sufficient ? (
                  <span
                    className="text-green-400"
                    title="You have enough"
                    aria-label="Sufficient"
                  >
                    ✓
                  </span>
                ) : (
                  <span
                    className="text-orange-400"
                    title={`Need ${deficit} more`}
                    aria-label="Insufficient"
                  >
                    ✗
                  </span>
                )}
                <span className="text-sm text-[var(--color-foreground)]">
                  {mat.name}
                </span>
              </div>
              <div className="text-right text-xs">
                <span
                  className={
                    sufficient
                      ? "font-semibold text-green-400"
                      : "font-semibold text-orange-400"
                  }
                >
                  {mat.quantityOwned.toLocaleString()}
                </span>
                <span className="text-[var(--color-muted)]">
                  {" "}
                  / {mat.quantityNeeded.toLocaleString()}
                </span>
                {!sufficient && (
                  <span className="ml-1 text-orange-400">
                    (-{deficit.toLocaleString()})
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
