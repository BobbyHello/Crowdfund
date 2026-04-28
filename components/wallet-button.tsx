"use client";

import { useWallet } from "@/app/wallet-context";

function shorten(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function WalletButton() {
  const { address, connect, disconnect } = useWallet();

  if (address) {
    return (
      <button
        onClick={disconnect}
        title="Click to disconnect"
        className="shrink-0 rounded-sm border border-border bg-surface px-3 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent"
      >
        <span className="font-mono">{shorten(address)}</span>
        <span className="smallcaps hidden text-subtle sm:inline"> · disconnect</span>
      </button>
    );
  }

  return (
    <button
      onClick={connect}
      className="shrink-0 rounded-sm bg-accent px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-accent-fg transition-colors hover:bg-[#a01818]"
    >
      Connect Wallet
    </button>
  );
}
