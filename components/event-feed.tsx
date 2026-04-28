"use client";

import { useContractEvents } from "@/hooks/use-contract-events";
import type { ContractEvent } from "@/lib/events";
import { stroopsToXlm } from "@/lib/soroban";

function shortAddr(a: string) {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const s = Math.floor(d / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function EventFeed() {
  const { data, isLoading, isError } = useContractEvents();

  return (
    <section className="rounded-sm border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-xl font-bold tracking-tight sm:text-2xl">
          Pledge Wire
        </h3>
        <span className="smallcaps flex items-center gap-1.5 text-[10px] text-accent">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          Live
        </span>
      </div>
      {isLoading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse bg-elevated" />
          ))}
        </div>
      ) : isError ? (
        <div className="mt-4 text-sm text-danger">Could not reach the Soroban RPC.</div>
      ) : !data || data.length === 0 ? (
        <div className="mt-4 text-sm text-subtle">
          No pledges yet. Once the wire opens, the latest 50 will appear here.
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {data.map((e) => (
            <EventRow key={e.id} e={e} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EventRow({ e }: { e: ContractEvent }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
      <div className="min-w-0">
        <span className="font-mono text-xs">{shortAddr(e.backer)}</span>
        <span className="text-subtle"> pledged to </span>
        <span className="font-medium">
          campaign #{String(e.campaignId).padStart(2, "0")}
        </span>
      </div>
      <div className="flex shrink-0 items-baseline gap-3">
        <span className="font-mono text-sm text-accent">
          {stroopsToXlm(e.amount)} XLM
        </span>
        <a
          href={`https://stellar.expert/explorer/testnet/tx/${e.txHash}`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-subtle hover:text-accent"
        >
          {timeAgo(e.ledgerClosedAt)}
        </a>
      </div>
    </li>
  );
}
