"use client";

/**
 * MSF Star Progression:
 * 1. Yellow stars: 0-7
 * 2. Red stars: 0-7 (after yellow maxed)
 * 3. Diamonds: each red star above 7 = 1 diamond (max ~4-5)
 *
 * The API stores everything in yellowStars (0-7) and redStars (0-12+).
 * redStars > 7 means the character has diamonds.
 */

export function parseStars(yellowStars: number, redStars: number) {
  const ys = Math.min(yellowStars, 7);
  const rs = Math.min(redStars, 7);
  const diamonds = Math.max(redStars - 7, 0);
  return { ys, rs, diamonds };
}

/** Compact star display for roster tiles — single line icons.
 *
 * Hierarchy (show only the highest tier):
 * - Has diamonds → show only diamonds
 * - Has red stars → show 7 stars: first N red, rest yellow
 * - Yellow only → show yellow stars
 */
export function CompactStars({
  yellowStars = 0,
  redStars = 0,
}: {
  yellowStars?: number;
  redStars?: number;
}) {
  const { ys, rs, diamonds } = parseStars(yellowStars, redStars);

  if (ys === 0 && rs === 0 && diamonds === 0) return null;

  // Diamonds → show only diamonds
  if (diamonds > 0) {
    return (
      <span className="flex items-center gap-px text-[9px] leading-none">
        <span className="text-cyan-300">{"◆".repeat(diamonds)}</span>
      </span>
    );
  }

  // Red stars → 7 stars with first rs colored red, rest yellow
  if (rs > 0) {
    const yellowRemaining = 7 - rs;
    return (
      <span className="flex items-center gap-px text-[9px] leading-none">
        <span className="text-red-400">{"★".repeat(rs)}</span>
        {yellowRemaining > 0 && (
          <span className="text-yellow-400">{"★".repeat(yellowRemaining)}</span>
        )}
      </span>
    );
  }

  // Yellow only
  return (
    <span className="flex items-center gap-px text-[9px] leading-none">
      <span className="text-yellow-400">{"★".repeat(ys)}</span>
    </span>
  );
}

/** Star row display for meta/farming pages — shows filled/empty stars + diamonds */
export function MetaStars({
  yellowStars = 0,
  redStars = 0,
}: {
  yellowStars?: number;
  redStars?: number;
}) {
  const { ys, rs, diamonds } = parseStars(yellowStars, redStars);

  return (
    <>
      <span className="text-xs whitespace-nowrap">
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            style={{ color: i < ys ? "#facc15" : "var(--color-muted)" }}
          >
            {i < ys ? "\u2605" : "\u2606"}
          </span>
        ))}
      </span>
      <span className="text-xs whitespace-nowrap">
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            style={{ color: i < rs ? "#ef4444" : "var(--color-muted)" }}
          >
            {i < rs ? "\u2605" : "\u2606"}
          </span>
        ))}
        {diamonds > 0 && (
          <span className="text-cyan-300 ml-0.5">{"◆".repeat(diamonds)}</span>
        )}
      </span>
    </>
  );
}

/** Full star display for character detail view — shows labels */
export function DetailStars({
  yellowStars = 0,
  redStars = 0,
}: {
  yellowStars?: number;
  redStars?: number;
}) {
  const { ys, rs, diamonds } = parseStars(yellowStars, redStars);

  if (ys === 0 && rs === 0 && diamonds === 0) return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      {ys > 0 && (
        <span className="text-yellow-400">{"★".repeat(ys)}</span>
      )}
      {rs > 0 && (
        <span className="text-red-400">{"★".repeat(rs)}</span>
      )}
      {diamonds > 0 && (
        <span className="text-cyan-300">{"◆".repeat(diamonds)}</span>
      )}
    </div>
  );
}
