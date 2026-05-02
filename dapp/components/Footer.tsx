export function Footer() {
  return (
    <footer className="mt-16 border-t-2 border-ink-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink-500">
        <div>
          Built for ETHGlobal Open Agents · Sepolia testnet · Uniswap + ENS
        </div>
        <div className="flex items-center gap-4">
          <span className="font-pixel text-[10px]">v0.0.1</span>
          <span className="italic">One signature. Zero baggage. Your wallet, reorged.</span>
        </div>
      </div>
    </footer>
  );
}
