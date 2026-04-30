"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Mascot } from "./Mascot";

//<Partially written by AI.>
export function Header() {
  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-cream/70 border-b-2 border-ink-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-3 group"
          aria-label="WalletYeet home"
        >
          <span className="inline-block group-hover:animate-wiggle">
            <Mascot size={42} variant="static" />
          </span>
          <span className="font-display text-2xl font-extrabold tracking-tight">
            Wallet<span className="text-gradient">Yeet</span>
          </span>
          <span className="hidden sm:inline-block pill pill--lilac ml-2">
            Sepolia
          </span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/migrate"
            className="hidden sm:inline-flex btn-pop btn-pop--ghost"
          >
            Migrate
          </Link>
          <a
            href="https://github.com/"
            target="_blank"
            rel="noreferrer"
            className="hidden md:inline-flex btn-pop btn-pop--ghost"
          >
            GitHub ↗
          </a>
          <ConnectButton
            chainStatus="icon"
            showBalance={false}
            accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
          />
        </nav>
      </div>
    </header>
  );
}
