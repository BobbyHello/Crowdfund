// TEMPLATE: read user's balance of the project's custom token (only used when
// uses_custom_token: true). Calls the SEP-41 `balance` method via simulateTransaction.
// If the concept doesn't use a custom token, delete this file and the ReceiptsPanel.
"use client";

import { useQuery } from "@tanstack/react-query";
import { readContract, addrArg } from "@/lib/soroban";

export function useTokenBalance(address: string | null) {
  const contractId = process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ID;
  return useQuery({
    queryKey: ["token-balance", contractId, address],
    queryFn: async () => {
      if (!contractId) throw new Error("token contract id not configured");
      if (!address) return 0n;
      return readContract<bigint>({
        contractId,
        method: "balance",
        args: [addrArg(address)],
        source: address,
      });
    },
    enabled: !!address && !!contractId,
    refetchInterval: 10_000,
  });
}
