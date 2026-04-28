"use client";

import { useQuery } from "@tanstack/react-query";
import { readContract, u32Arg } from "@/lib/soroban";

export type GlobalStats = {
  activeCampaigns?: number;
  totalPledgedStroops?: bigint;
  badgesMinted?: bigint;
};

type RawStatus = string | { tag: string } | null | undefined;

function isLive(raw: RawStatus): boolean {
  if (typeof raw === "string") return raw === "Live";
  if (raw && typeof raw === "object" && "tag" in raw) return raw.tag === "Live";
  return false;
}

export function useGlobalStats() {
  const mainId = process.env.NEXT_PUBLIC_MAIN_CONTRACT_ID;
  const tokenId = process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ID;

  return useQuery<GlobalStats>({
    queryKey: ["global-stats", mainId, tokenId],
    queryFn: async () => {
      if (!mainId) throw new Error("main contract id not configured");

      const count = await readContract<number>({
        contractId: mainId,
        method: "campaign_count",
        args: [],
      });
      const ids = Array.from({ length: Number(count) }, (_, i) => i);
      const campaigns = await Promise.all(
        ids.map((id) =>
          readContract<{
            pledged: bigint | number;
            deadline: bigint | number;
            status: RawStatus;
          }>({
            contractId: mainId,
            method: "campaign",
            args: [u32Arg(id)],
          }).catch(() => null)
        )
      );

      const now = BigInt(Math.floor(Date.now() / 1000));
      const totalPledgedStroops = campaigns.reduce(
        (acc, c) => (c ? acc + BigInt(c.pledged) : acc),
        0n
      );
      const activeCampaigns = campaigns.filter(
        (c) => c && isLive(c.status) && BigInt(c.deadline) > now
      ).length;

      let badgesMinted: bigint | undefined;
      if (tokenId) {
        badgesMinted = await readContract<bigint>({
          contractId: tokenId,
          method: "total_supply",
          args: [],
        }).catch(() => 0n);
      }

      return { activeCampaigns, totalPledgedStroops, badgesMinted };
    },
    enabled: !!mainId,
    refetchInterval: 30_000,
  });
}
