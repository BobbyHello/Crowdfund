"use client";

import { useWallet } from "@/app/wallet-context";
import { BalanceCard } from "./balance-card";
import { ReceiptsPanel } from "./receipts-panel";
import { CreateCampaignForm } from "./send-form";
import { CampaignList } from "./campaign-list";
import { EventFeed } from "./event-feed";

export function Dashboard() {
  const { address, connect } = useWallet();

  return (
    <div className="grid gap-8 sm:grid-cols-12 sm:gap-10">
      <div className="space-y-6 sm:col-span-8">
        {address ? <CreateCampaignForm /> : <ConnectCta onConnect={connect} />}
        <CampaignList />
      </div>
      <aside className="space-y-5 sm:col-span-4">
        {address && (
          <>
            <BalanceCard />
            <ReceiptsPanel />
          </>
        )}
        <EventFeed />
      </aside>
    </div>
  );
}

function ConnectCta({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="featured-rule rounded-sm border border-border bg-surface p-6 sm:p-8">
      <p className="smallcaps text-[10px] text-accent">Editor's note</p>
      <h2 className="mt-2 font-serif text-2xl font-bold tracking-tight sm:text-[1.7rem]">
        Connect a wallet to file a campaign
      </h2>
      <p className="mt-2 max-w-xl text-sm text-muted sm:text-base">
        Folio runs on Stellar testnet. Use Freighter, xBull, Lobstr, or Albedo. Friendbot will fund a fresh testnet account with 10,000 XLM.
      </p>
      <button
        onClick={onConnect}
        className="mt-5 rounded-sm bg-accent px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-accent-fg transition-colors hover:bg-[#a01818]"
      >
        Connect Wallet
      </button>
    </div>
  );
}
