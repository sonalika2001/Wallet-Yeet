import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function shortAddr(addr?: string, head = 6, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function formatUsd(n: number | undefined): string {
  if (n === undefined || isNaN(n)) return "—";
  if (n < 0.01) return "<$0.01";
  if (n < 1000) return `$${n.toFixed(2)}`;
  if (n < 1_000_000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${(n / 1_000_000).toFixed(2)}m`;
}

export function formatBigAmount(amount: string | undefined, decimals = 18): string {
  if (!amount) return "0";
  try {
    const big = BigInt(amount);
    const divisor = 10n ** BigInt(decimals);
    const whole = big / divisor;
    const frac = big % divisor;
    if (whole >= 1_000_000n) return `${(Number(whole) / 1_000_000).toFixed(2)}M`;
    if (whole >= 1_000n) return `${(Number(whole) / 1_000).toFixed(2)}k`;
    if (whole > 0n) {
      const fracStr = frac.toString().padStart(decimals, "0").slice(0, 2);
      return `${whole.toString()}.${fracStr}`;
    }
    const fracStr = frac.toString().padStart(decimals, "0");
    return `0.${fracStr.slice(0, 4)}`;
  } catch {
    return amount;
  }
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function isAddress(s: string): s is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}
