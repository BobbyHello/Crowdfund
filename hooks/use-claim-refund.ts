"use client";

import { useMutation } from "@tanstack/react-query";
import { networkPassphrase } from "@/lib/stellar";
import { invokeContract, addrArg, u32Arg } from "@/lib/soroban";
import { StellarWalletsKit } from "@/lib/wallets";

function makeSign(address: string) {
  return async (xdr: string) => {
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
      address,
      networkPassphrase,
    });
    return signedTxXdr;
  };
}

export function useClaim(address: string | null) {
  return useMutation({
    mutationFn: async (campaignId: number) => {
      if (!address) throw new Error("connect a wallet first");
      const contractId = process.env.NEXT_PUBLIC_MAIN_CONTRACT_ID;
      if (!contractId) throw new Error("NEXT_PUBLIC_MAIN_CONTRACT_ID is not set");
      const result = await invokeContract({
        contractId,
        method: "claim",
        args: [u32Arg(campaignId)],
        source: address,
        signXdr: makeSign(address),
      });
      return { contractHash: result.hash };
    },
  });
}

export function useRefund(address: string | null) {
  return useMutation({
    mutationFn: async (campaignId: number) => {
      if (!address) throw new Error("connect a wallet first");
      const contractId = process.env.NEXT_PUBLIC_MAIN_CONTRACT_ID;
      if (!contractId) throw new Error("NEXT_PUBLIC_MAIN_CONTRACT_ID is not set");
      const result = await invokeContract({
        contractId,
        method: "refund",
        args: [addrArg(address), u32Arg(campaignId)],
        source: address,
        signXdr: makeSign(address),
      });
      return { contractHash: result.hash };
    },
  });
}
