"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/app/wallet-context";
import { useCampaigns, type CampaignView } from "@/hooks/use-campaigns";
import { usePledge } from "@/hooks/use-send-tx";
import { useClaim, useRefund } from "@/hooks/use-claim-refund";
import {
  toError,
  UserRejectedError,
  InsufficientBalanceError,
} from "@/lib/errors";
import { stroopsToXlm } from "@/lib/soroban";

const EXPLORER = "https://stellar.expert/explorer/testnet/tx";

export function CampaignList() {
  const { address } = useWallet();
  const { data, isLoading, isError, refetch } = useCampaigns(address);

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="font-serif text-2xl font-black tracking-tight sm:text-[1.6rem]">
          The Slate
        </h3>
        <span className="smallcaps text-[10px] text-subtle">
          {data?.length ?? 0} campaign{(data?.length ?? 0) === 1 ? "" : "s"}
        </span>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-sm bg-elevated" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-sm border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          Could not read campaigns. Confirm the main contract id in <code className="font-mono">.env.local</code>.
        </div>
      )}

      {!isLoading && !isError && (data?.length ?? 0) === 0 && (
        <div className="rounded-sm border border-dashed border-border bg-elevated/40 p-8 text-center text-sm text-muted">
          No campaigns yet. Open the first one above.
        </div>
      )}

      <div className="space-y-5">
        {data?.map((c) => (
          <CampaignCard key={c.id} c={c} onActed={() => refetch()} />
        ))}
      </div>
    </section>
  );
}

function shortAddr(a: string) {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function timeRemaining(deadline: number): { label: string; closed: boolean } {
  const diff = deadline - Math.floor(Date.now() / 1000);
  if (diff <= 0) return { label: "Closed", closed: true };
  const days = Math.floor(diff / 86400);
  if (days >= 2) return { label: `${days} days left`, closed: false };
  if (days === 1) return { label: "1 day left", closed: false };
  const hours = Math.floor(diff / 3600);
  if (hours >= 2) return { label: `${hours} hours left`, closed: false };
  if (hours === 1) return { label: "1 hour left", closed: false };
  const minutes = Math.max(1, Math.floor(diff / 60));
  return { label: `${minutes} min left`, closed: false };
}

function StatusStamp({ kind }: { kind: "live" | "funded" | "missed" | "refunding" }) {
  const map = {
    live: { label: "Live", classes: "border-accent/70 text-accent" },
    funded: { label: "Funded", classes: "border-success/60 text-[var(--color-success)]" },
    missed: { label: "Goal Missed", classes: "border-danger/50 text-danger" },
    refunding: { label: "Refunding", classes: "border-danger/50 text-danger" },
  } as const;
  const m = map[kind];
  return (
    <span
      className={`smallcaps inline-block border px-2 py-0.5 text-[10px] font-medium ${m.classes}`}
    >
      {m.label}
    </span>
  );
}

function CampaignCard({ c, onActed }: { c: CampaignView; onActed: () => void }) {
  const { address } = useWallet();
  const qc = useQueryClient();

  const remaining = timeRemaining(c.deadline);
  const isClosed = remaining.closed;
  const goalMet = c.pledged >= c.goal;
  const isFunded = c.status === "Funded";
  const stampKind: "live" | "funded" | "missed" | "refunding" = isFunded
    ? "funded"
    : !isClosed
      ? "live"
      : goalMet
        ? "live"
        : "missed";

  const isCreator = address && address === c.creator;
  const isBeneficiary = address && address === c.beneficiary;
  // beneficiary can claim as soon as the goal is met - no deadline gate
  const canClaim = goalMet && !isFunded && (isCreator || isBeneficiary);
  const canRefund = isClosed && !goalMet && c.myPledge > 0n && !!address;
  const remainingToGoal = c.goal > c.pledged ? c.goal - c.pledged : 0n;

  const pct = c.goal === 0n ? 0 : Number((c.pledged * 1000n) / c.goal) / 10;
  const pctClamped = Math.min(100, Math.max(0, pct));

  const pledge = usePledge(address);
  const claim = useClaim(address);
  const refund = useRefund(address);

  const [amount, setAmount] = useState("");
  const [showSuccess, setShowSuccess] = useState<string | null>(null);

  function bump() {
    qc.invalidateQueries({ queryKey: ["balance", address] });
    qc.invalidateQueries({ queryKey: ["token-balance"] });
    qc.invalidateQueries({ queryKey: ["global-stats"] });
    onActed();
  }

  async function onPledge(e: FormEvent) {
    e.preventDefault();
    if (!address) return;
    try {
      const r = await pledge.mutateAsync({ campaignId: c.id, amount });
      setAmount("");
      setShowSuccess(r.contractHash);
      bump();
    } catch {
      // surfaced via pledge.error
    }
  }

  async function onClaim() {
    try {
      const r = await claim.mutateAsync(c.id);
      setShowSuccess(r.contractHash);
      bump();
    } catch {
      /* surfaced */
    }
  }

  async function onRefund() {
    try {
      const r = await refund.mutateAsync(c.id);
      setShowSuccess(r.contractHash);
      bump();
    } catch {
      /* surfaced */
    }
  }

  const err =
    pledge.error ?? claim.error ?? refund.error
      ? toError(pledge.error ?? claim.error ?? refund.error)
      : null;

  const pending = pledge.isPending || claim.isPending || refund.isPending;

  return (
    <article className="rounded-sm border border-border bg-surface p-5 sm:p-6">
      <header className="grid gap-4 sm:grid-cols-12">
        <div className="sm:col-span-9">
          <p className="smallcaps text-[10px] text-subtle">
            #{c.id.toString().padStart(2, "0")} · By {shortAddr(c.creator)}
          </p>
          <h4 className="mt-1.5 font-serif text-2xl font-bold leading-tight tracking-tight sm:text-[1.65rem]">
            {c.title}
          </h4>
          <p className="mt-1 text-xs text-subtle">
            Beneficiary <span className="font-mono">{shortAddr(c.beneficiary)}</span> ·{" "}
            <span className={isClosed ? "text-danger" : ""}>{remaining.label}</span>
          </p>
        </div>
        <div className="flex items-start justify-start sm:col-span-3 sm:justify-end">
          <StatusStamp kind={stampKind} />
        </div>
      </header>

      <div className="mt-5">
        <div className="flex items-baseline justify-between text-sm">
          <div>
            <span className="font-mono text-lg font-medium">
              {stroopsToXlm(c.pledged)}
            </span>
            <span className="ml-1 text-muted">pledged</span>
          </div>
          <div className="text-xs text-muted">
            of <span className="font-mono">{stroopsToXlm(c.goal)}</span> XLM goal
          </div>
        </div>
        <div className="relative mt-2 h-1 w-full overflow-hidden bg-elevated">
          <div
            className="absolute left-0 top-0 h-full bg-accent transition-[width] duration-500"
            style={{ width: `${pctClamped}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-subtle">
          <span>
            {c.backers} backer{c.backers === 1 ? "" : "s"}
          </span>
          <span className="font-mono">{pctClamped.toFixed(1)}%</span>
        </div>
      </div>

      {address && c.myPledge > 0n && (
        <div className="mt-3 border-l-2 border-accent/40 pl-3 text-xs text-muted">
          Your pledge: <span className="font-mono text-fg">{stroopsToXlm(c.myPledge)} XLM</span>
        </div>
      )}

      <div className="mt-5 border-t border-border pt-4">
        {!address && (
          <p className="text-sm text-muted">Connect a wallet to pledge.</p>
        )}

        {address && !isClosed && !isFunded && !goalMet && (
          <form onSubmit={onPledge} className="flex flex-wrap items-center gap-3">
            <input
              type="number"
              step="0.0000001"
              min="0.0000001"
              required
              placeholder="Amount in XLM"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-40 rounded-sm border border-border bg-bg px-3 py-2 font-mono text-sm placeholder:text-subtle focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-sm bg-accent px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-accent-fg transition-colors hover:bg-[#a01818] disabled:opacity-50"
            >
              {pledge.isPending ? "Pledging…" : "Pledge"}
            </button>
            <span className="text-[11px] text-subtle">
              Up to {stroopsToXlm(remainingToGoal)} XLM left to reach the goal.
            </span>
          </form>
        )}

        {address && goalMet && !isFunded && !canClaim && (
          <p className="text-sm text-muted">
            Goal met. Waiting for the beneficiary{" "}
            <span className="font-mono">{shortAddr(c.beneficiary)}</span> to claim.
          </p>
        )}

        {address && canClaim && (
          <button
            onClick={onClaim}
            disabled={pending}
            className="rounded-sm bg-accent px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-accent-fg transition-colors hover:bg-[#a01818] disabled:opacity-50"
          >
            {claim.isPending ? "Claiming…" : `Claim ${stroopsToXlm(c.pledged)} XLM`}
          </button>
        )}

        {address && canRefund && (
          <button
            onClick={onRefund}
            disabled={pending}
            className="rounded-sm border border-danger/40 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-danger transition-colors hover:bg-danger/5 disabled:opacity-50"
          >
            {refund.isPending ? "Refunding…" : `Refund ${stroopsToXlm(c.myPledge)} XLM`}
          </button>
        )}

        {address && isClosed && !goalMet && c.myPledge === 0n && !isFunded && (
          <p className="text-sm text-muted">
            This campaign closed below its goal. Backers can refund their pledges.
          </p>
        )}

        {isFunded && (
          <p className="text-sm text-muted">
            Funded. Beneficiary <span className="font-mono">{shortAddr(c.beneficiary)}</span> claimed
            the escrow.
          </p>
        )}

        {showSuccess && (
          <a
            href={`${EXPLORER}/${showSuccess}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 block break-all font-mono text-[11px] text-[var(--color-link)] hover:text-accent"
          >
            tx · {showSuccess.slice(0, 18)}…
          </a>
        )}

        {err && (
          <div className="mt-3 rounded-sm border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
            {err instanceof UserRejectedError
              ? "You rejected the request in your wallet."
              : err instanceof InsufficientBalanceError
                ? "Not enough XLM in your account to cover this pledge."
                : `Failed: ${err.message}`}
          </div>
        )}
      </div>
    </article>
  );
}
