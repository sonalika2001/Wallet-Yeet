import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/types";

const STYLES: Record<RiskLevel, string> = {
  SAFE: "pill pill--safe",
  SUSPICIOUS: "pill pill--suspicious",
  DANGEROUS: "pill pill--dangerous",
};

const ICONS: Record<RiskLevel, string> = {
  SAFE: "✓",
  SUSPICIOUS: "!",
  DANGEROUS: "✕",
};

export function RiskBadge({
  risk,
  className,
}: {
  risk: RiskLevel;
  className?: string;
}) {
  return (
    <span className={cn(STYLES[risk], className)}>
      <span className="font-pixel">{ICONS[risk]}</span>
      {risk}
    </span>
  );
}
