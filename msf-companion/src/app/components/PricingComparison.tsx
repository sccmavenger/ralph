const FREE_FEATURES = [
  "Dashboard with live widgets",
  "Roster overview",
  "Basic character details",
  "Commander profile",
  "Offers preview with value scores",
  "War & Crucible meta previews",
  "Farming target highlights",
];

const PREMIUM_FEATURES = [
  "Full War & Crucible meta analysis",
  "Complete farming guide with recommendations",
  "Offers deep-dive with cost-efficiency scoring",
  "Dark Dimension planner",
  "Upgrade Token build guide",
  "Time Heist reference guide",
  "Multi-criteria roster filtering",
  "Per-character upgrade path tracking",
  "Full inventory view with search",
  "AI-powered Advisor",
  "Investment Planner",
  "Team Builder & analysis",
  "All future premium features",
];

export default function PricingComparison() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Free */}
      <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-center text-sm font-bold text-[var(--color-muted)]">
          Free
        </h2>
        <ul className="space-y-2">
          {FREE_FEATURES.map((f) => (
            <li
              key={f}
              className="flex items-start gap-2 text-xs text-[var(--color-muted)]"
            >
              <span className="text-green-400">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Premium */}
      <div className="rounded-xl border border-[var(--color-accent)]/50 bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-center text-sm font-bold text-[var(--color-accent)]">
          Premium
        </h2>
        <ul className="space-y-2">
          {PREMIUM_FEATURES.map((f) => (
            <li
              key={f}
              className="flex items-start gap-2 text-xs text-[var(--color-foreground)]"
            >
              <span className="text-green-400">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
