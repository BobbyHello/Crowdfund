"use client";

import { useWallet } from "@/app/wallet-context";
import { useBalance } from "@/hooks/use-balance";

function formatXlm(raw: string) {
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return raw;
  return n.toFixed(4).replace(/\.?0+$/, "");
}

export function BalanceCard() {
  const { address } = useWallet();
  const { data, isLoading, isError } = useBalance(address);

  if (!address) return null;

  return (
    <div className="rounded-sm border border-border bg-surface p-5">
      <div className="smallcaps text-[10px] text-subtle">Wallet Balance</div>
      <div className="mt-2 font-mono text-3xl font-medium tracking-tight sm:text-[2.25rem]">
        {isLoading ? (
          <span className="inline-block h-8 w-32 animate-pulse rounded bg-elevated sm:h-9 sm:w-40" />
        ) : isError ? (
          <span className="text-base font-normal text-danger">Failed to load</span>
        ) : (
          <>
            {formatXlm(data ?? "0")}
            <span className="ml-2 font-sans text-base font-normal text-muted">XLM</span>
          </>
        )}
      </div>
      <div className="mt-3 text-xs text-subtle">Stellar testnet · refreshes every 30s.</div>
    </div>
  );
}
