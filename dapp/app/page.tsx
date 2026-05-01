import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Mascot } from "@/components/Mascot";
import { PixelButton } from "@/components/PixelButton";
import { SponsorBadges } from "@/components/SponsorBadges";
import { ChainBadge } from "@/components/ChainBadge";

export default function LandingPage() {
  return (
    <>
      <Header />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="dot-grid absolute inset-0 opacity-50 pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid lg:grid-cols-[1.2fr,1fr] gap-12 items-center relative">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="pill pill--lilac">
                ETHGlobal Open Agents
              </span>
              <ChainBadge />
            </div>
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05]">
              Yeet your wallet.
              <br />
              <span className="text-gradient">Done in one batch.</span>
            </h1>
            <p className="mt-5 text-lg text-ink-700 max-w-xl">
              AI agents discover, audit, and plan. You choose what goes
              where. WalletYeet bundles approvals, transfers, dust swaps,
              ENS subnames and risky-allowance revocations into a single
              EIP-7702 migration so you sign once instead of fourteen times.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/migrate">
                <PixelButton variant="primary">
                  Start migration 🚀
                </PixelButton>
              </Link>
              <a
                href="#how-it-works"
                className="btn-pop btn-pop--ghost"
              >
                How it works
              </a>
            </div>

            {/* trust row */}
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-mint-400 animate-pulse" />
                Live on Sepolia testnet
              </span>
              <span>Open source · MIT</span>
              <span>Built solo for ETHGlobal</span>
            </div>
          </div>

          {/* hero card with mascot */}
          <div className="relative">
            <div className="card-pop p-6 bg-gradient-to-br from-peach-50 via-white to-lilac-50">
              <div className="flex items-center justify-between">
                <div className="font-pixel text-[10px] tracking-[0.2em] text-ink-500">
                  WALLET-YEET // v0.1
                </div>
                <span className="pill pill--safe">ready</span>
              </div>

              <div className="flex flex-col items-center gap-3 py-6">
                <Mascot size={180} />
                <div className="font-display text-xl font-bold">
                  one batched yeet
                </div>
                <div className="text-xs text-ink-500 -mt-1">
                  multi-asset · multi-destination · one signature
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                <div className="rounded-xl border-2 border-ink-900 bg-sky-50 py-2">
                  <div className="font-pixel text-[10px]">SCOUT</div>
                  <div className="text-ink-500">discovers</div>
                </div>
                <div className="rounded-xl border-2 border-ink-900 bg-peach-50 py-2">
                  <div className="font-pixel text-[10px]">AUDITOR</div>
                  <div className="text-ink-500">scores risk</div>
                </div>
                <div className="rounded-xl border-2 border-ink-900 bg-lilac-50 py-2">
                  <div className="font-pixel text-[10px]">PLANNER</div>
                  <div className="text-ink-500">routes</div>
                </div>
              </div>
            </div>

            {/* floating sticker */}
            <div className="absolute -top-6 -left-8 hidden sm:block animate-float">
              <div className="card-pop bg-mint-50 px-3 py-2 text-xs font-bold rotate-[-6deg]">
                🤖 GPT-4o-mini agents
              </div>
            </div>
            <div className="absolute -bottom-4 -right-2 hidden sm:block animate-float" style={{ animationDelay: "0.6s" }}>
              <div className="card-pop bg-sky-50 px-3 py-2 text-xs font-bold rotate-[5deg]">
                ⚡ EIP-7702 batched
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PAIN → CURE */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid md:grid-cols-2 gap-6 items-stretch">
          <div className="card-pop p-6 bg-red-50/40">
            <div className="font-pixel text-[10px] tracking-widest text-red-500">
              TODAY
            </div>
            <div className="font-display text-2xl font-bold mt-1">
              Migrating wallets sucks.
            </div>
            <ul className="mt-4 space-y-2 text-sm text-ink-700">
              <li>❌ Forget to revoke risky approvals</li>
              <li>❌ Miss ENS subnames entirely</li>
              <li>❌ Leave dust tokens behind forever</li>
              <li>❌ Send everything to one wallet by mistake</li>
              <li>❌ Manually sign 30 transactions, hoping nothing breaks</li>
            </ul>
          </div>

          <div className="card-pop p-6 bg-mint-50/60">
            <div className="font-pixel text-[10px] tracking-widest text-mint-500">
              WITH WALLETYEET
            </div>
            <div className="font-display text-2xl font-bold mt-1">
              One batched migration.
            </div>
            <ul className="mt-4 space-y-2 text-sm text-ink-700">
              <li>✅ Scout finds every token, NFT, ENS, and approval</li>
              <li>✅ Auditor flags risky approvals → revoked first</li>
              <li>✅ Planner routes assets to your chosen wallets</li>
              <li>✅ Dust auto-swapped to USDC via Uniswap V3</li>
              <li>✅ EIP-7702 batches everything into one signature</li>
            </ul>
          </div>
        </div>
      </section>

      {/* THREE AGENTS */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="text-center mb-10">
          <div className="font-pixel text-[10px] tracking-widest text-ink-500">
            THE PIPELINE
          </div>
          <h2 className="font-display text-4xl font-bold mt-2">
            Three agents. One batched yeet.
          </h2>
          <p className="text-ink-500 mt-2 max-w-xl mx-auto">
            Each GPT-4o-mini agent has a focused job. They run sequentially
            and stream progress to the UI — every step has a verifiable
            on-chain identity under <span className="font-mono">walletyeet-demo.eth</span>.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {[
            {
              emoji: "🔍",
              tag: "Scout",
              tint: "from-sky-100 to-sky-50",
              shadow: "shadow-pop-sky",
              steps: [
                "Alchemy: tokens, NFTs, allowances",
                "ENS: owned subnames + records",
                "Annotates with values + hints",
              ],
            },
            {
              emoji: "⚠️",
              tag: "Auditor",
              tint: "from-peach-100 to-peach-50",
              shadow: "shadow-pop-peach",
              steps: [
                "Reviews every approval",
                "Flags SAFE / SUSPICIOUS / DANGEROUS",
                "Identifies sub-$1 dust",
              ],
            },
            {
              emoji: "📋",
              tag: "Planner",
              tint: "from-lilac-100 to-lilac-50",
              shadow: "shadow-pop-lilac",
              steps: [
                "Sequences ops safely",
                "Honors per-asset destinations",
                "Adds dust→USDC swap ops",
              ],
            },
          ].map((a) => (
            <div key={a.tag} className={`card-pop p-5 bg-gradient-to-br ${a.tint}`}>
              <div className={`w-12 h-12 grid place-items-center rounded-2xl border-2 border-ink-900 bg-white text-2xl ${a.shadow}`}>
                {a.emoji}
              </div>
              <div className="font-display text-2xl font-bold mt-3">
                {a.tag}
              </div>
              <ol className="mt-2 space-y-1.5 text-sm text-ink-700 list-decimal list-inside">
                {a.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      {/* SPONSORS */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="text-center mb-6">
          <div className="font-pixel text-[10px] tracking-widest text-ink-500">
            SPONSOR INTEGRATIONS
          </div>
          <h2 className="font-display text-3xl font-bold mt-2">
            Modular adapters. Each can fail independently.
          </h2>
          <p className="text-ink-500 mt-2 max-w-2xl mx-auto">
            Core migration works on its own. Adapters just add features —
            disable any one with a feature flag and the rest still ship.
          </p>
        </div>
        <SponsorBadges />
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-20">
        <div className="card-pop p-8 sm:p-10 bg-gradient-to-br from-peach-50 via-white to-lilac-50 text-center">
          <Mascot size={120} className="mx-auto" />
          <h2 className="font-display text-4xl font-bold mt-4">
            Ready to migrate?
          </h2>
          <p className="text-ink-500 mt-2">
            Connect your old wallet. The agents take it from there.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/migrate">
              <PixelButton variant="primary">
                Launch the migration 🚀
              </PixelButton>
            </Link>
            <a
              href="https://github.com/"
              target="_blank"
              rel="noreferrer"
              className="btn-pop btn-pop--ghost"
            >
              Read the code ↗
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
