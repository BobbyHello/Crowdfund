"use client";

import { useQuery } from "@tanstack/react-query";
import { addrArg, readContract, u32Arg } from "@/lib/soroban";

export type CampaignStatus = "Live" | "Funded";

export type CampaignView = {
  id: number;
  creator: string;
  beneficiary: string;
  title: string;
  goal: bigint;
  pledged: bigint;
  deadline: number;
  status: CampaignStatus;
  backers: number;
  myPledge: bigint;
};

type RawStatus = string | { tag: string; values: unknown[] } | null | undefined;

function decodeStatus(raw: RawStatus): CampaignStatus {
  if (typeof raw === "string") return raw === "Funded" ? "Funded" : "Live";
  if (raw && typeof raw === "object" && "tag" in raw) {
    return raw.tag === "Funded" ? "Funded" : "Live";
  }
  return "Live";
}

type RawCampaign = {
  creator: string;
  beneficiary: string;
  title: string;
  goal: bigint | number;
  pledged: bigint | number;
  deadline: bigint | number;
  status: RawStatus;
  backers: number;
};

export function useCampaigns(address: string | null) {
  const mainId = process.env.NEXT_PUBLIC_MAIN_CONTRACT_ID;
  return useQuery<CampaignView[]>({
    queryKey: ["campaigns", mainId, address],
    queryFn: async () => {
      if (!mainId) throw new Error("main contract id not configured");

      const count = await readContract<number>({
        contractId: mainId,
        method: "campaign_count",
        args: [],
      });

      const ids = Array.from({ length: Number(count) }, (_, i) => i);
      const items = await Promise.all(
        ids.map(async (id) => {
          const c = await readContract<RawCampaign>({
            contractId: mainId,
            method: "campaign",
            args: [u32Arg(id)],
          });
          let myPledge = 0n;
          if (address) {
            myPledge = await readContract<bigint>({
              contractId: mainId,
              method: "pledged_by",
              args: [u32Arg(id), addrArg(address)],
            }).catch(() => 0n);
          }
          return {
            id,
            creator: c.creator,
            beneficiary: c.beneficiary,
            title: c.title,
            goal: BigInt(c.goal),
            pledged: BigInt(c.pledged),
            deadline: Number(c.deadline),
            status: decodeStatus(c.status),
            backers: Number(c.backers),
            myPledge: typeof myPledge === "bigint" ? myPledge : BigInt(myPledge),
          } as CampaignView;
        })
      );
      return items.reverse();
    },
    enabled: !!mainId,
    refetchInterval: 15_000,
  });
}
