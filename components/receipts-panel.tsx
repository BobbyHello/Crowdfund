"use client";

import { useWallet } from "@/app/wallet-context";
import { useTokenBalance } from "@/hooks/use-token-balance";

const TOKEN_ID = process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ID;

export function ReceiptsPanel() {
  const { address } = useWallet();
  const { data, isLoading, isError } = useTokenBalance(address);

  if (!address) return null;

  return (
    <div className="featured-rule rounded-sm border border-border bg-surface p-5">
      <div className="smallcaps text-[10px] text-subtle">Supporter Badges</div>
      <div className="mt-2 flex items-baseline gap-3">
        <div className="font-mono text-3xl font-medium tracking-tight sm:text-[2.25rem]">
          {isLoading ? (
            <span className="inline-block h-8 w-16 animate-pulse rounded bg-elevated sm:h-9" />
          ) : isError ? (
            <span className="text-base font-normal text-danger">Err</span>
          ) : (
            String(data ?? 0n)
          )}
        </div>
        <div className="text-sm text-muted">
          {Number(data ?? 0n) === 1 ? "badge" : "badges"} on this wallet
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-subtle">
        <span className="smallcaps">Soulbound · SEP-41</span>
        {TOKEN_ID && (
          <a
            href={`https://stellar.expert/explorer/testnet/contract/${TOKEN_ID}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[var(--color-link)] hover:text-accent"
          >
            {TOKEN_ID.slice(0, 4)}…{TOKEN_ID.slice(-4)}
          </a>
        )}
      </div>
    </div>
  );
}
