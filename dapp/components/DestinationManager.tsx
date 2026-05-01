"use client";

import { useEffect, useState } from "react";
import type { SavedDestination } from "@/lib/types";
import { isAddress, shortAddr, cn } from "@/lib/utils";
import { resolveENS } from "@/lib/adapters/ens";
import { PixelButton } from "./PixelButton";

interface Props {
  defaultDestination: `0x${string}` | "";
  onChangeDefault: (addr: `0x${string}` | "") => void;
  destinations: SavedDestination[];
  onAddDestination: (d: SavedDestination) => void;
  onRemoveDestination: (addr: `0x${string}`) => void;
}

//<Emojis written by AI.>
const EMOJI_CHOICES = ["🏠", "❄️", "🔥", "💎", "🎨", "🛡️", "🪙", "🚀"];

// Helper: a string is "ENS-shaped" if it contains a dot — we use that as a
// cheap signal to attempt resolution rather than asking the user to toggle.
function looksLikeEns(s: string): boolean {
  return s.includes(".") && !s.startsWith("0x");
}

// Hook: debounced ENS resolution. Returns { resolved, status }.
type ResolveStatus = "idle" | "resolving" | "resolved" | "not-found" | "error";

function useEnsResolver(input: string): {
  resolved: `0x${string}` | null;
  status: ResolveStatus;
} {
  const [resolved, setResolved] = useState<`0x${string}` | null>(null);
  const [status, setStatus] = useState<ResolveStatus>("idle");

  useEffect(() => {
    const trimmed = input.trim();
    if (!looksLikeEns(trimmed)) {
      setResolved(null);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("resolving");
    setResolved(null);

    const timer = setTimeout(async () => {
      try {
        const addr = await resolveENS(trimmed);
        if (cancelled) return;
        if (addr && isAddress(addr)) {
          setResolved(addr);
          setStatus("resolved");
        } else {
          setStatus("not-found");
        }
      } catch (err) {
        if (cancelled) return;
        console.warn("[DestinationManager] ENS resolve failed:", err);
        setStatus("error");
      }
    }, 350); // debounce typing

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input]);

  return { resolved, status };
}

export function DestinationManager({
  defaultDestination,
  onChangeDefault,
  destinations,
  onAddDestination,
  onRemoveDestination,
}: Props) {
  // Local input states — separate from the parent's "validated address"
  // state so users can type partial values (e.g. "ali" → "alice.eth")
  // without the parent flipping back and forth.
  const [defaultInput, setDefaultInput] = useState<string>(defaultDestination);
  const [newLabel, setNewLabel] = useState("");
  const [newAddrInput, setNewAddrInput] = useState("");
  const [newEmoji, setNewEmoji] = useState(EMOJI_CHOICES[0]);
  const [error, setError] = useState<string | null>(null);

  // Live ENS resolution for both inputs.
  const defaultResolution = useEnsResolver(defaultInput);
  const newAddrResolution = useEnsResolver(newAddrInput);

  // Whenever the default input resolves to a real 0x or already IS one,
  // promote it to the parent.
  useEffect(() => {
    const trimmed = defaultInput.trim();
    if (trimmed === "") {
      onChangeDefault("");
      return;
    }
    if (isAddress(trimmed)) {
      onChangeDefault(trimmed as `0x${string}`);
      return;
    }
    if (defaultResolution.status === "resolved" && defaultResolution.resolved) {
      onChangeDefault(defaultResolution.resolved);
      return;
    }
    // While resolving / not-found, leave the parent's value alone.
  }, [defaultInput, defaultResolution.status, defaultResolution.resolved, onChangeDefault]);

  // Effective resolved address for the "add destination" flow.
  const effectiveNewAddr: `0x${string}` | null =
    isAddress(newAddrInput.trim())
      ? (newAddrInput.trim() as `0x${string}`)
      : newAddrResolution.resolved;

  const validNew = !!effectiveNewAddr && newLabel.trim().length > 0;

  const handleAdd = () => {
    if (!validNew || !effectiveNewAddr) {
      setError("Need a label and a valid 0x address or ENS name.");
      return;
    }
    setError(null);
    onAddDestination({
      label: newLabel.trim(),
      address: effectiveNewAddr,
      emoji: newEmoji,
    });
    setNewLabel("");
    setNewAddrInput("");
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-ink-700 mb-1">
          Default destination <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-ink-500 mb-2">
          Required. Anything you don&apos;t explicitly route in the Review
          step lands here. Paste a 0x address or an ENS name.
        </p>
        <input
          value={defaultInput}
          onChange={(e) => setDefaultInput(e.target.value)}
          placeholder="0x… or alice.eth"
          className="w-full rounded-xl border-2 border-ink-900 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-4 focus:ring-peach-200 font-mono"
        />
        <ResolutionHint input={defaultInput} resolution={defaultResolution} />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-semibold text-ink-700">
            Extra destinations (optional)
          </label>
          <span className="text-xs text-ink-500">
            {destinations.length}/5 wallets
          </span>
        </div>
        <p className="text-xs text-ink-500 mb-2">
          Save labelled wallets so you can route specific assets to them in
          the Review step (e.g. cold storage, hot wallet, NFT vault).
        </p>

        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {destinations.map((d) => (
            <li
              key={d.address}
              className="card-soft p-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl">{d.emoji ?? "🏷️"}</span>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {d.label}
                  </div>
                  <div className="text-xs text-ink-500 font-mono">
                    {shortAddr(d.address)}
                  </div>
                </div>
              </div>
              <button
                onClick={() => onRemoveDestination(d.address)}
                className="text-ink-500 hover:text-red-500 text-xs"
                aria-label={`Remove ${d.label}`}
              >
                remove
              </button>
            </li>
          ))}
          {destinations.length === 0 && (
            <li className="card-soft p-3 text-xs text-ink-500 sm:col-span-2">
              No extra destinations yet. Skip if you only want one wallet —
              everything will go to the default. Otherwise add some below.
            </li>
          )}
        </ul>
      </div>

      <div className="card-soft p-4">
        <div className="text-sm font-semibold mb-2">Add a destination</div>
        <div className="grid gap-2 sm:grid-cols-[auto,1fr,2fr,auto]">
          <select
            value={newEmoji}
            onChange={(e) => setNewEmoji(e.target.value)}
            className="rounded-xl border-2 border-ink-900 bg-white px-2 py-2 text-base"
          >
            {EMOJI_CHOICES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Cold storage"
            className="rounded-xl border-2 border-ink-900 bg-white px-3 py-2 text-sm"
          />
          <input
            value={newAddrInput}
            onChange={(e) => setNewAddrInput(e.target.value)}
            placeholder="0x… or alice.eth"
            className={cn(
              "rounded-xl border-2 bg-white px-3 py-2 text-sm font-mono",
              newAddrInput && !effectiveNewAddr ? "border-red-400" : "border-ink-900",
            )}
          />
          <PixelButton
            variant="primary"
            disabled={!validNew || destinations.length >= 5}
            onClick={handleAdd}
          >
            Add
          </PixelButton>
        </div>
        <ResolutionHint input={newAddrInput} resolution={newAddrResolution} />
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}

/** Inline hint shown beneath an address input — explains ENS resolution state. */
function ResolutionHint({
  input,
  resolution,
}: {
  input: string;
  resolution: ReturnType<typeof useEnsResolver>;
}) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (isAddress(trimmed)) return null;
  if (resolution.status === "resolving") {
    return <p className="mt-1 text-xs text-ink-500">Resolving ENS…</p>;
  }
  if (resolution.status === "resolved" && resolution.resolved) {
    return (
      <p className="mt-1 text-xs text-mint-500">
        ✓ {trimmed} → <span className="font-mono">{shortAddr(resolution.resolved)}</span>
      </p>
    );
  }
  if (resolution.status === "not-found") {
    return <p className="mt-1 text-xs text-red-500">No ENS record found.</p>;
  }
  if (resolution.status === "error") {
    return <p className="mt-1 text-xs text-red-500">Resolver error — check Sepolia RPC.</p>;
  }
  return <p className="mt-1 text-xs text-red-500">Doesn&apos;t look like a valid 0x address yet.</p>;
}
