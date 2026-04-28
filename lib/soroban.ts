import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  rpc,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { networkPassphrase } from "./stellar";

const RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";

const READ_SOURCE =
  process.env.NEXT_PUBLIC_READ_SOURCE ??
  "GBZGPMRLYDWCC6GKX5B7HYFYQWZOUHND3RMGGR5R7TYEA7SE7QGZ5QO7";

export const sorobanRpc = new rpc.Server(RPC_URL);

export type ScArg = xdr.ScVal;

export function addrArg(s: string): ScArg {
  return new Address(s).toScVal();
}

export function i128Arg(stroops: bigint): ScArg {
  return nativeToScVal(stroops, { type: "i128" });
}

export function strArg(s: string): ScArg {
  return nativeToScVal(s, { type: "string" });
}

export function u32Arg(n: number): ScArg {
  return nativeToScVal(n, { type: "u32" });
}

export function u64Arg(n: bigint | number): ScArg {
  const v = typeof n === "bigint" ? n : BigInt(n);
  return nativeToScVal(v, { type: "u64" });
}

export async function invokeContract(opts: {
  contractId: string;
  method: string;
  args: ScArg[];
  source: string;
  signXdr: (xdr: string) => Promise<string>;
}): Promise<{ hash: string; returnValue: unknown }> {
  const account = await sorobanRpc.getAccount(opts.source);
  const contract = new Contract(opts.contractId);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(opts.method, ...opts.args))
    .setTimeout(30)
    .build();

  const sim = await sorobanRpc.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }

  const prepared = rpc.assembleTransaction(tx, sim).build();
  const signedXdr = await opts.signXdr(prepared.toXDR());
  const signed = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);

  const sendRes = await sorobanRpc.sendTransaction(signed);
  if (sendRes.status === "ERROR") {
    throw new Error(`send failed: ${JSON.stringify(sendRes.errorResult)}`);
  }
  const hash = sendRes.hash;

  let result = await sorobanRpc.getTransaction(hash);
  let tries = 0;
  while (result.status === "NOT_FOUND" && tries < 30) {
    await new Promise((r) => setTimeout(r, 1000));
    result = await sorobanRpc.getTransaction(hash);
    tries++;
  }
  if (result.status === "FAILED") {
    throw new Error("contract call failed on chain");
  }

  let returnValue: unknown;
  if (result.status === "SUCCESS" && result.returnValue) {
    try {
      returnValue = scValToNative(result.returnValue);
    } catch {
      returnValue = undefined;
    }
  }
  return { hash, returnValue };
}

export async function readContract<T = unknown>(opts: {
  contractId: string;
  method: string;
  args: ScArg[];
  source?: string;
}): Promise<T> {
  const account = new Account(opts.source ?? READ_SOURCE, "0");
  const contract = new Contract(opts.contractId);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(opts.method, ...opts.args))
    .setTimeout(30)
    .build();

  const sim = await sorobanRpc.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }
  if (!("result" in sim) || !sim.result?.retval) {
    throw new Error("no return value from contract");
  }
  return scValToNative(sim.result.retval) as T;
}

export function xlmToStroops(xlm: string): bigint {
  const [whole, frac = ""] = xlm.split(".");
  const padded = (frac + "0000000").slice(0, 7);
  return BigInt(whole || "0") * 10_000_000n + BigInt(padded || "0");
}

export function stroopsToXlm(stroops: bigint): string {
  const n = Number(stroops) / 1e7;
  return n.toFixed(4).replace(/\.?0+$/, "");
}
