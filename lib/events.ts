import { rpc, xdr, scValToNative } from "@stellar/stellar-sdk";
import { sorobanRpc } from "./soroban";

const EVENT_TOPIC = "pledge";

export type ContractEvent = {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
  backer: string;
  campaignId: number;
  amount: bigint;
};

export async function getRecentEvents(
  contractId: string,
  windowLedgers = 5000
): Promise<ContractEvent[]> {
  const latest = await sorobanRpc.getLatestLedger();
  const startLedger = Math.max(1, latest.sequence - windowLedgers);

  const topicXdr = xdr.ScVal.scvSymbol(EVENT_TOPIC).toXDR("base64");
  const res = await sorobanRpc.getEvents({
    startLedger,
    filters: [
      {
        type: "contract",
        contractIds: [contractId],
        topics: [[topicXdr, "*", "*"]],
      },
    ],
    limit: 50,
  });

  return res.events.map(decodeEvent).reverse();
}

function decodeEvent(e: rpc.Api.EventResponse): ContractEvent {
  const backer = scValToNative(e.topic[1]) as string;
  const campaignId = Number(scValToNative(e.topic[2]));
  const raw = scValToNative(e.value) as bigint | number;
  return {
    id: e.id,
    ledger: e.ledger,
    ledgerClosedAt: e.ledgerClosedAt,
    txHash: e.txHash,
    backer,
    campaignId,
    amount: typeof raw === "bigint" ? raw : BigInt(raw),
  };
}
