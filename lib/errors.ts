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

export function toError(e: unknown): Error {
  if (e instanceof Error) {
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
