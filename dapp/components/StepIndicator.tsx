"use client";

import { cn } from "@/lib/utils";

export interface Step {
  id: string;
  label: string;
  icon?: string;
}

export function StepIndicator({
  steps,
  current,
}: {
  steps: Step[];
  current: number;
}) {
  return (
    <ol className="flex items-center gap-1 sm:gap-3 w-full overflow-x-auto pb-1">
      {steps.map((s, i) => {
        const state =
          i < current ? "done" : i === current ? "active" : "pending";
        return (
          <li key={s.id} className="flex items-center gap-1 sm:gap-3 shrink-0">
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border-2 text-xs sm:text-sm font-semibold transition-all",
                state === "done" &&
                  "bg-mint-100 border-ink-900 text-ink-900",
                state === "active" &&
                  "bg-peach-100 border-ink-900 text-ink-900 shadow-pop-sm",
                state === "pending" &&
                  "bg-white/60 border-ink-300 text-ink-500"
              )}
            >
              <span
                className={cn(
                  "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-pixel",
                  state === "done" && "bg-mint-400 text-ink-900",
                  state === "active" && "bg-peach-500 text-white",
                  state === "pending" && "bg-ink-100 text-ink-500"
                )}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.icon ?? s.label.charAt(0)}</span>
            </div>
            {i < steps.length - 1 && (
              <span
                className={cn(
                  "h-0.5 w-6 sm:w-10",
                  i < current ? "bg-ink-900" : "bg-ink-300"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
