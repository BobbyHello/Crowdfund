"use client";

import { useGlobalStats } from "@/hooks/use-global-stats";

const MAIN_CONTRACT_ID = process.env.NEXT_PUBLIC_MAIN_CONTRACT_ID;

function fmt(n?: number | bigint): string {
  if (n === undefined) return "—";
  return Number(n).toLocaleString("en-US");
}

function fmtXlm(stroops?: bigint): string {
  if (stroops === undefined) return "—";
  return (Number(stroops) / 1e7).toFixed(2);
}

export function StatsStrip() {
  const { data, isLoading } = useGlobalStats();

  return (
    <section className="mt-10 border-t border-border pt-5">
      <div className="smallcaps text-[10px] text-subtle">By the Numbers</div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <Stat label="Active Campaigns" value={fmt(data?.activeCampaigns)} loading={isLoading} />
        <Stat label="Total Pledged (XLM)" value={fmtXlm(data?.totalPledgedStroops)} loading={isLoading} />
        <Stat label="Badges Minted" value={fmt(data?.badgesMinted)} loading={isLoading} />
        <Stat
          label="Main Contract"
          value={
            MAIN_CONTRACT_ID
              ? `${MAIN_CONTRACT_ID.slice(0, 4)}…${MAIN_CONTRACT_ID.slice(-4)}`
              : "—"
          }
          href={
            MAIN_CONTRACT_ID
              ? `https://stellar.expert/explorer/testnet/contract/${MAIN_CONTRACT_ID}`
              : undefined
          }
          loading={false}
          mono
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  loading,
  href,
  mono,
}: {
  label: string;
  value: string;
  loading: boolean;
  href?: string;
  mono?: boolean;
}) {
  const content = (
    <div className="border-l border-border pl-4">
      <div className="smallcaps text-[10px] text-subtle">{label}</div>
      <div
        className={`mt-1 font-mono font-medium tracking-tight ${
          mono ? "text-sm" : "text-xl sm:text-2xl"
        }`}
      >
        {loading ? (
          <span className="inline-block h-6 w-16 animate-pulse rounded bg-elevated" />
        ) : (
          value
        )}
      </div>
    </div>
  );
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="block transition-colors hover:[&>div]:border-accent hover:[&_.font-mono]:text-accent"
      >
        {content}
      </a>
    );
  }
  return content;
}
