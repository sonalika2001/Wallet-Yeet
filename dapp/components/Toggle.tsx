"use client";

import { cn } from "@/lib/utils";

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  accent = "peach",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  accent?: "peach" | "mint" | "sky" | "lilac";
}) {
  const accentBg = {
    peach: "bg-peach-500",
    mint: "bg-mint-400",
    sky: "bg-sky-400",
    lilac: "bg-lilac-400",
  }[accent];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "w-full text-left card-soft p-4 flex items-center gap-4 transition-all",
        disabled && "opacity-50 cursor-not-allowed",
        checked && "border-ink-900 ring-2 ring-peach-200"
      )}
    >
      <span
        className={cn(
          "shrink-0 inline-flex items-center w-12 h-7 rounded-full border-2 border-ink-900 transition-colors",
          checked ? accentBg : "bg-ink-100"
        )}
      >
        <span
          className={cn(
            "block w-5 h-5 rounded-full bg-white border-2 border-ink-900 transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </span>
      <div className="min-w-0">
        <div className="font-semibold text-sm">{label}</div>
        {description && (
          <div className="text-xs text-ink-500 mt-0.5">{description}</div>
        )}
      </div>
    </button>
  );
}
