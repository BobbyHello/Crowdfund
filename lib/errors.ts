export class WalletNotFoundError extends Error {
  readonly code = "wallet_not_found";
  constructor(message = "no stellar wallet found in the browser") {
    super(message);
    this.name = "WalletNotFoundError";
  }
}

export class UserRejectedError extends Error {
  readonly code = "user_rejected";
  constructor(message = "user rejected the request") {
    super(message);
    this.name = "UserRejectedError";
  }
}

export class InsufficientBalanceError extends Error {
  readonly code = "insufficient_balance";
  constructor(message = "not enough xlm to cover this transaction") {
    super(message);
    this.name = "InsufficientBalanceError";
  }
}

const CONTRACT_ERRORS: Record<number, string> = {
  1: "Contract is not initialized.",
  2: "Goal must be greater than zero.",
  3: "Deadline must be in the future.",
  4: "Amount must be greater than zero.",
  5: "Campaign not found.",
  6: "This campaign is closed.",
  7: "Deadline has not been reached yet.",
  8: "Goal was not met.",
  9: "Goal already met.",
  10: "Already claimed.",
  11: "No pledge found for this address.",
  12: "Title is required.",
  13: "Pledge exceeds the remaining goal.",
};

export function decodeContractError(message: string): string | null {
  const m = message.match(/Error\(Contract,\s*#(\d+)\)/i);
  if (!m) return null;
  const code = Number(m[1]);
  return CONTRACT_ERRORS[code] ?? `Contract error #${code}.`;
}

export function toError(e: unknown): Error {
  if (e instanceof Error) {
    const contractMsg = decodeContractError(e.message);
    if (contractMsg) return new Error(contractMsg);
    const msg = e.message.toLowerCase();
    if (
      msg.includes("rejected") ||
      msg.includes("declined") ||
      msg.includes("denied") ||
      msg.includes("user did not")
    ) {
      return new UserRejectedError(e.message);
    }
    if (
      msg.includes("insufficient") ||
      msg.includes("underfunded") ||
      msg.includes("op_underfunded")
    ) {
      return new InsufficientBalanceError(e.message);
    }
    if (
      msg.includes("not found") ||
      msg.includes("no wallet") ||
      msg.includes("not installed")
    ) {
      return new WalletNotFoundError(e.message);
    }
    return e;
  }
  return new Error(String(e));
}
