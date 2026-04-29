"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "mint" | "sky" | "lilac" | "ghost" | "default";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  full?: boolean;
}

export const PixelButton = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "default", full, className, children, ...rest }, ref) => {
    const v =
      variant === "default"
        ? ""
        : variant === "ghost"
        ? "btn-pop--ghost"
        : `btn-pop--${variant}`;
    return (
      <button
        ref={ref}
        className={cn("btn-pop", v, full && "w-full justify-center", className)}
        {...rest}
      >
        {children}
      </button>
    );
  }
);
PixelButton.displayName = "PixelButton";
