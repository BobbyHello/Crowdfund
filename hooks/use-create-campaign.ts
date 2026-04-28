"use client";

import { useMutation } from "@tanstack/react-query";
import { networkPassphrase } from "@/lib/stellar";
import {
  invokeContract,
  addrArg,
  i128Arg,
  strArg,
  u64Arg,
  xlmToStroops,
} from "@/lib/soroban";
import { StellarWalletsKit } from "@/lib/wallets";

type Input = {
  beneficiary: string;
  title: string;
  goalXlm: string;
  durationDays: number;
};

type Output = { contractHash: string; campaignId: number | null };

export function useCreateCampaign(address: string | null) {
  return useMutation({
    mutationFn: async (input: Input): Promise<Output> => {
      if (!address) throw new Error("connect a wallet first");
      const contractId = process.env.NEXT_PUBLIC_MAIN_CONTRACT_ID;
      if (!contractId) throw new Error("NEXT_PUBLIC_MAIN_CONTRACT_ID is not set");

      const sign = async (xdr: string) => {
        const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
          address,
          networkPassphrase,
        });
        return signedTxXdr;
      };

      const goal = xlmToStroops(input.goalXlm);
      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + Math.max(1, input.durationDays) * 86400
      );

      const result = await invokeContract({
        contractId,
        method: "create_campaign",
        args: [
          addrArg(address),
          addrArg(input.beneficiary || address),
          strArg(input.title),
          i128Arg(goal),
          u64Arg(deadline),
        ],
        source: address,
        signXdr: sign,
      });

      const id =
        typeof result.returnValue === "number"
          ? result.returnValue
          : typeof result.returnValue === "bigint"
            ? Number(result.returnValue)
            : null;

      return { contractHash: result.hash, campaignId: id };
    },
  });
}
