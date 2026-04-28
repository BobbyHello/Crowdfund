import { WalletButton } from "@/components/wallet-button";
import { Dashboard } from "@/components/dashboard";
import { HeroSection } from "@/components/hero-section";
import { StatsStrip } from "@/components/stats-strip";

export default function Home() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-14">
        <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-baseline gap-3 sm:gap-5">
            <h1 className="font-serif text-3xl font-black leading-none tracking-tight sm:text-4xl">
              Folio
            </h1>
            <span className="smallcaps hidden text-[11px] text-subtle sm:inline">
              Issue 04 · Stellar Testnet
            </span>
          </div>
          <WalletButton />
        </header>

        <HeroSection />
        <StatsStrip />

        <hr className="section-rule" />

        <Dashboard />

        <footer className="mt-16 border-t border-border pt-6 text-xs text-subtle">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="smallcaps">Folio · Risein Stellar Belt 04</span>
            <span className="font-mono">testnet only · do not send mainnet xlm</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
