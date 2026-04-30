export function Footer() {
  return (
    <footer className="mt-16 border-t-2 border-ink-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink-500">
        <div>
          Built for ETHGlobal Open Agents · Sepolia testnet · KeeperHub +
          Uniswap + ENS
        </div>
        <div className="flex items-center gap-4">
          <span className="font-pixel text-[10px]">v0.1.0</span>
          <span>Don&apos;t bail — yeet.</span>
        </div>
      </div>
    </footer>
  );
}
