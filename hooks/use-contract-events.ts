"use client";

import { useQuery } from "@tanstack/react-query";
import { getRecentEvents } from "@/lib/events";

export function useContractEvents() {
  const contractId = process.env.NEXT_PUBLIC_MAIN_CONTRACT_ID;
  return useQuery({
    queryKey: ["events", contractId],
    queryFn: () => {
      if (!contractId) throw new Error("main contract id not configured");
      return getRecentEvents(contractId);
    },
    enabled: !!contractId,
    refetchInterval: 6_000,
  });
}
