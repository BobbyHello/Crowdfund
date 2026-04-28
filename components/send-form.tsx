"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/app/wallet-context";
import { useCreateCampaign } from "@/hooks/use-create-campaign";
import {
  toError,
  UserRejectedError,
  InsufficientBalanceError,
} from "@/lib/errors";

const EXPLORER = "https://stellar.expert/explorer/testnet/tx";

const inputCls =
  "w-full rounded-sm border border-border bg-bg px-3 py-2 text-sm placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function CreateCampaignForm() {
  const { address } = useWallet();
  const qc = useQueryClient();
  const create = useCreateCampaign(address);

  const [title, setTitle] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [goal, setGoal] = useState("");
  const [days, setDays] = useState("7");

  if (!address) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        title: title.trim(),
        beneficiary: beneficiary.trim(),
        goalXlm: goal,
        durationDays: Number(days),
      });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["global-stats"] });
      qc.invalidateQueries({ queryKey: ["balance", address] });
      setTitle("");
      setBeneficiary("");
      setGoal("");
      setDays("7");
    } catch {
      // surfaced via create.error
    }
  }

  const err = create.error ? toError(create.error) : null;

  return (
    <form
      onSubmit={onSubmit}
      className="featured-rule space-y-3 rounded-sm border border-border bg-surface p-5 sm:p-6"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-xl font-bold tracking-tight sm:text-2xl">
          Open a Campaign
        </h3>
        <span className="smallcaps text-[10px] text-subtle">Editor's draft</span>
      </div>
      <p className="text-sm text-muted">
        Give the work a title, set the goal, and pick a window. After the deadline the contract decides who gets paid.
      </p>

      <input
        type="text"
        placeholder="Title (e.g. Print run for Issue 04)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        maxLength={64}
        className={inputCls}
      />

      <input
        type="text"
        placeholder={`Beneficiary G-address (defaults to ${address.slice(0, 4)}…${address.slice(-4)})`}
        value={beneficiary}
        onChange={(e) => setBeneficiary(e.target.value.trim())}
        className={`${inputCls} font-mono`}
      />

      <div className="grid grid-cols-2 gap-3">
        <input
          type="number"
          step="0.0000001"
          min="0.0000001"
          placeholder="Goal in XLM"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          required
          className={`${inputCls} font-mono`}
        />
        <select
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className={`${inputCls} font-mono`}
        >
          <option value="1">1 day</option>
          <option value="3">3 days</option>
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={create.isPending}
        className="w-full rounded-sm bg-accent px-3 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-accent-fg transition-colors hover:bg-[#a01818] disabled:opacity-50"
      >
        {create.isPending ? "Filing…" : "Open Campaign"}
      </button>

      {create.isPending && (
        <div className="text-xs text-subtle">
          Waiting for the wallet to sign and Soroban to confirm…
        </div>
      )}

      {create.isSuccess && create.data && (
        <div className="space-y-1.5 rounded-sm border border-success/30 bg-success/5 p-3 text-xs">
          <div className="font-medium text-[var(--color-success)]">
            Campaign filed{create.data.campaignId !== null ? ` as #${String(create.data.campaignId).padStart(2, "0")}` : ""}.
          </div>
          <a
            href={`${EXPLORER}/${create.data.contractHash}`}
            target="_blank"
            rel="noreferrer"
            className="block break-all font-mono text-muted hover:text-[var(--color-success)]"
          >
            tx · {create.data.contractHash.slice(0, 16)}…
          </a>
        </div>
      )}

      {err && (
        <div className="rounded-sm border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          {err instanceof UserRejectedError
            ? "You rejected the request in your wallet."
            : err instanceof InsufficientBalanceError
              ? "Not enough XLM in your account to cover this transaction."
              : `Failed: ${err.message}`}
        </div>
      )}
    </form>
  );
}
