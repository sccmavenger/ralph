"use client";

interface SourceCitationBadgeProps {
  tier: number;
  creatorName: string;
  sourceUrl?: string;
  sourceType: string;
  isPremium?: boolean;
}

function getTierConfig(tier: number, creatorName: string): { label: string; className: string } {
  switch (tier) {
    case 1:
      return { label: "Official Data", className: "bg-green-600/20 text-green-400 border-green-600/30" };
    case 2:
      return { label: `Blog: ${creatorName}`, className: "bg-blue-600/20 text-blue-400 border-blue-600/30" };
    case 3:
      return { label: creatorName || "Community", className: "bg-gray-600/20 text-gray-300 border-gray-600/30" };
    case 4:
      return { label: "AI Generated", className: "bg-gray-800/20 text-gray-500 border-gray-700/30" };
    default:
      return { label: "Source", className: "bg-gray-600/20 text-gray-400 border-gray-600/30" };
  }
}

export default function SourceCitationBadge({ tier, creatorName, sourceUrl, sourceType, isPremium }: SourceCitationBadgeProps) {
  if (!isPremium) return null;

  const { label, className } = getTierConfig(tier, creatorName);

  const badge = (
    <span
      data-testid="source-citation-badge"
      data-tier={tier}
      data-source-type={sourceType}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium min-h-[44px] ${className}`}
    >
      {label}
    </span>
  );

  if (sourceUrl) {
    return (
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex"
        data-testid="source-citation-link"
      >
        {badge}
      </a>
    );
  }

  return badge;
}
