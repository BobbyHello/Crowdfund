# Folio

Crowdfund: factory + escrow + soulbound supporter badge on Stellar testnet.

Goal-based crowdfunding dApp. Backers pledge XLM into a Soroban escrow contract. After the deadline, the beneficiary claims the pot if the goal closed; otherwise every backer can pull their pledge back. Each pledge mints a soulbound SEP-41 supporter badge through an inter-contract call. Live event feed is polled from Soroban RPC.

[![CI](https://github.com/BobbyHello/Crowdfund/actions/workflows/ci.yml/badge.svg)](https://github.com/BobbyHello/Crowdfund/actions/workflows/ci.yml)

- Live: `<Vercel URL>`
- Demo video: `<Loom URL>`
- Main contract: [`CDSM73AL…GDON`](https://stellar.expert/explorer/testnet/contract/CDSM73ALYUJBNR4OK5YVR3AMWHBQCFG6BIB2RV22W7I3C6LPTAPAGDON)
- Receipt contract: [`CAJ6XYN6…H4ST`](https://stellar.expert/explorer/testnet/contract/CAJ6XYN6VRAVPVL353X6QWZHKHOW4COWKQ5GPV5OL2ZXP2H2KFZMH4ST)
- Native XLM SAC: [`CDLZFC3S…YSCC`](https://stellar.expert/explorer/testnet/contract/CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC) (testnet built-in)
- Example tx: [`1dccbdb3…3b238`](https://stellar.expert/explorer/testnet/tx/1dccbdb309efb9bd510024024d77accb0ee4cbafbab1b322e4776b9146b3b238) (set_admin handover during deploy)

```text
network:    Stellar Testnet
passphrase: Test SDF Network ; September 2015
contracts:
  main         CDSM73ALYUJBNR4OK5YVR3AMWHBQCFG6BIB2RV22W7I3C6LPTAPAGDON
  receipt      CAJ6XYN6VRAVPVL353X6QWZHKHOW4COWKQ5GPV5OL2ZXP2H2KFZMH4ST
  native xlm   CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

Both deployed contract ids land in `.env.local` after running `scripts/deploy.sh alice`. The native XLM Stellar Asset Contract (SAC) is referenced by the main contract at construction time and is not redeployed by this project.

## Architecture

```text
                 Frontend (Next.js 15 App Router)
                      |
                      | StellarWalletsKit (Freighter / xBull / Lobstr / Albedo)
                      v
              [ wallet signs txs ]
                      |
            +---------+---------+
            |                   |
            v                   v
     Horizon (read XLM)   Soroban RPC (read + write)
                                |
                                v
                    +------------------------+
                    | main contract          |  campaign storage, escrow, claim, refund
                    +------------------------+
                       |        |       |
                       |        |       +----> events: created, pledge, funded, refund
                       |        |
                       |        +----> token::Client.transfer(...) on native XLM SAC
                       |
                       +----> ReceiptClient.mint(backer, 1)  (inter-contract)
                                |
                                v
                    +------------------------+
                    | receipt contract       |  SEP-41 soulbound supporter badge
                    +------------------------+
```

1. `app/`: Next.js App Router entry, providers (React Query, wallet context), editorial-styled hero and stats.
2. `components/`: UI panels (campaign cards, create-campaign form, balance, badges, pledge wire).
3. `hooks/`: React Query bindings to read campaigns, write actions (pledge / claim / refund / create), stream events.
4. `lib/`: Stellar SDK adapters: `stellar.ts` (Horizon), `soroban.ts` (RPC + ScVal helpers), `wallets.ts` (explicit Stellar Wallets Kit modules, no `defaultModules()`), `events.ts` (`getEvents`), `errors.ts` (typed error mapper).
5. `contract/main`: Soroban Rust crate. Campaign factory, escrow, inter-contract mint.
6. `contract/receipt`: Soroban Rust crate. SEP-41-style soulbound supporter badge (no `transfer` exposed).

## State Model

Main contract storage:

| key                              | storage     | type                  | purpose                                       |
|----------------------------------|-------------|-----------------------|-----------------------------------------------|
| `Receipt`                        | instance    | `Address`             | SEP-41 receipt contract for supporter badges  |
| `Token`                          | instance    | `Address`             | Native XLM Stellar Asset Contract             |
| `NextId`                         | instance    | `u32`                 | Auto-increment for next campaign id           |
| `Campaign(id)`                   | persistent  | `Campaign` struct     | Per-campaign record                           |
| `Pledge(id, backer)`             | persistent  | `i128`                | Per-backer pledge amount (zeroed on refund)   |

`Campaign { creator, beneficiary, title, goal, pledged, deadline, status, backers }` where `status` is `Live | Funded`.

Receipt contract storage:

| key                | storage     | type        | purpose                          |
|--------------------|-------------|-------------|----------------------------------|
| `Admin`            | instance    | `Address`   | Address allowed to mint badges   |
| `TotalSupply`      | persistent  | `i128`      | Sum of all minted badges         |
| `Balance(addr)`    | persistent  | `i128`      | Per-holder badge count           |

## Sequence of Calls

Pledge (the core flow):

1. Backer connects wallet via `app/wallet-context.tsx` → StellarWalletsKit.
2. UI calls `usePledge.mutate({ campaignId, amount })` (`hooks/use-send-tx.ts`).
3. `invokeContract` builds + simulates a `pledge(backer, campaign_id, amount)` transaction. Simulation discovers the inner `token.transfer` auth requirement on the native XLM SAC and includes it in the auth footprint.
4. Wallet signs both auth entries (outer contract call + inner SAC transfer) in one prompt.
5. Soroban executes:
   - Inner: native XLM SAC moves `amount` stroops from `backer` to `current_contract_address()`.
   - Storage write: `Campaign(id).pledged += amount`, `Pledge(id, backer) += amount`, `Campaign(id).backers += 1` if first pledge.
   - Inner: receipt contract `mint(backer, 1)` (admin auth = main contract is auto-authorized for self).
   - Event: `(symbol "pledge", backer, campaign_id) -> i128 amount`.
6. Frontend invalidates `["campaigns", ...]`, `["balance", ...]`, `["token-balance", ...]`, `["global-stats", ...]` and re-renders.

Claim (after deadline, goal met):

1. Beneficiary or creator calls `claim(campaign_id)`.
2. Contract checks `now >= deadline && pledged >= goal && status == Live`.
3. Contract calls `token.transfer(self, beneficiary, pledged)`.
4. `Campaign(id).status = Funded`.
5. Event: `(symbol "funded", campaign_id) -> i128 payout`.

Refund (after deadline, goal missed):

1. Backer calls `refund(backer, campaign_id)`.
2. Contract checks `now >= deadline && pledged < goal && status != Funded`.
3. Contract calls `token.transfer(self, backer, pledge_amount)`.
4. `Pledge(id, backer) = 0`.
5. Event: `(symbol "refund", backer, campaign_id) -> i128 amount`.

## Contract API

Main contract (`contract/main/src/lib.rs`):

| method                                                         | description                                       | errors                                                                 |
|----------------------------------------------------------------|---------------------------------------------------|------------------------------------------------------------------------|
| `__constructor(receipt, token)`                                 | Wire the receipt and native XLM SAC               | -                                                                      |
| `create_campaign(creator, beneficiary, title, goal, deadline)`  | Open a new campaign, returns u32 id               | `TitleEmpty`, `GoalMustBePositive`, `DeadlineInPast`                  |
| `pledge(backer, campaign_id, amount)`                           | Escrow XLM, mint badge, record pledge             | `AmountMustBePositive`, `UnknownCampaign`, `CampaignClosed`, `NotInitialized` |
| `claim(campaign_id)`                                            | Pay escrow to beneficiary                         | `UnknownCampaign`, `AlreadyClaimed`, `DeadlineNotReached`, `GoalNotMet` |
| `refund(backer, campaign_id)`                                   | Return backer's pledge                            | `UnknownCampaign`, `GoalAlreadyMet`, `DeadlineNotReached`, `NoPledgeFound` |
| `campaign(id)`                                                  | Read campaign struct                              | `UnknownCampaign`                                                     |
| `pledged_by(id, backer)`                                        | Read backer's pledge amount (0 if none)           | -                                                                      |
| `campaign_count()`                                              | Number of campaigns ever created                  | -                                                                      |
| `receipt_contract()`, `token_contract()`                        | Return the wired addresses                        | `NotInitialized`                                                      |

Receipt contract (`contract/receipt/src/lib.rs`): SEP-41 surface plus `mint(to, amount)` admin-gated; no `transfer` so badges are soulbound.

## Frontend / Contract Mapping

| hook                          | contract method        | input ScVal types          | result handling                                   |
|-------------------------------|------------------------|----------------------------|---------------------------------------------------|
| `useCreateCampaign`            | `create_campaign`      | Address, Address, String, i128, u64 | Returns u32 campaign id; surfaces typed error    |
| `usePledge`                    | `pledge`               | Address, u32, i128         | Returns tx hash; mutation; invalidates queries    |
| `useClaim`                     | `claim`                | u32                        | Returns tx hash                                   |
| `useRefund`                    | `refund`               | Address, u32               | Returns tx hash                                   |
| `useCampaigns`                 | `campaign_count`, `campaign(id)`, `pledged_by(id, addr)` | u32, Address | List of `CampaignView`; refetches every 15s     |
| `useGlobalStats`               | `campaign_count`, `campaign(id)`, `total_supply()` | u32 | Stats strip; refetches every 30s                  |
| `useTokenBalance`              | `balance(addr)` (receipt) | Address                  | Supporter badge count                             |
| `useContractEvents`            | RPC `getEvents` filter `pledge` topic | -            | Last 50 pledge events; refetches every 6s         |
| `useBalance`                   | Horizon `loadAccount`  | -                          | Native XLM balance                                |

## Errors

Contract error variants (typed `Result`, no panics on user input):

| variant                 | raised by                                   |
|-------------------------|---------------------------------------------|
| `NotInitialized`        | reading wired Receipt or Token before constructor |
| `GoalMustBePositive`    | `create_campaign` with non-positive goal     |
| `DeadlineInPast`        | `create_campaign` with deadline <= now       |
| `AmountMustBePositive`  | `pledge` with non-positive amount            |
| `UnknownCampaign`       | any read/write against a missing id          |
| `CampaignClosed`        | `pledge` after deadline or on a Funded campaign |
| `DeadlineNotReached`    | `claim` or `refund` before the deadline      |
| `GoalNotMet`            | `claim` when pledged < goal                  |
| `GoalAlreadyMet`        | `refund` when goal was met                   |
| `AlreadyClaimed`        | `claim` after status flipped to Funded       |
| `NoPledgeFound`         | `refund` when backer has nothing to recover  |
| `TitleEmpty`            | `create_campaign` with empty title           |

Frontend typed errors (`lib/errors.ts`): `WalletNotFoundError`, `UserRejectedError`, `InsufficientBalanceError`, plus a `toError` mapper that classifies SDK / wallet messages into one of the three.

## Tests

Run with `cd contract && cargo test`.

| test                                       | covers                                                          | contract |
|--------------------------------------------|-----------------------------------------------------------------|----------|
| `pledge_increases_total_and_mints_badge`   | Pledge updates totals, escrow moves XLM, mints 1 badge          | main     |
| `multiple_pledges_accumulate`              | Multi-backer accumulation; correct backer count and badge count | main     |
| `claim_pays_beneficiary_when_goal_met`     | Escrow released to beneficiary, status flips to Funded          | main     |
| `refund_returns_pledge_when_goal_missed`   | Backer reclaims pledge; further refund returns `NoPledgeFound`  | main     |
| `cannot_pledge_after_deadline`             | `CampaignClosed` typed error path                                | main     |
| `unknown_campaign_returns_error`           | Baseline read on an absent campaign                              | main     |
| `refund_blocked_when_goal_was_met`         | `GoalAlreadyMet` typed error path                                | main     |
| `negative_amounts_rejected`                 | `GoalMustBePositive` and `AmountMustBePositive`                  | main     |
| `mint_increases_balance_and_supply`        | Receipt mint accumulates supply                                  | receipt  |
| `multiple_mints_accumulate`                 | Receipt multi-holder accumulation                                | receipt  |
| `negative_mint_returns_error`              | Receipt error path                                               | receipt  |
| `unminted_address_has_zero_balance`         | Receipt baseline                                                 | receipt  |
| `metadata_is_correct`                       | SEP-41 name / symbol / decimals                                  | receipt  |
| `admin_can_be_transferred`                  | `set_admin` permits handover to main contract                   | receipt  |

## Build and Deploy

Prerequisites:

- Node 22+
- Rust stable + Stellar CLI 25+ with the `wasm32v1-none` target installed (`rustup target add wasm32v1-none`)
- A Stellar testnet wallet (Freighter, xBull, Lobstr, or Albedo)
- A funded testnet account (Freighter has a one-click Friendbot button, or use `stellar keys generate alice --network testnet --fund`)

First run against the already-deployed contracts:

```bash
git clone git@github.com:BobbyHello/Crowdfund.git folio
cd folio
npm install
cp .env.example .env.local
# .env.example already points at the deployed contract ids and testnet endpoints
PORT=3001 npm run dev   # http://localhost:3001
```

Run the gates:

```bash
cd contract && cargo test && cd ..   # 14 contract tests
npx tsc --noEmit                      # frontend typecheck
npm run build                          # next.js production build
```

Deploy fresh contracts under your own admin key:

```bash
stellar keys generate alice --network testnet --fund   # if alice does not exist
scripts/deploy.sh alice
```

What the script does:

1. Resolves the native XLM SAC id with `stellar contract id asset --asset native --network testnet`.
2. Runs `stellar contract build` for both crates against `wasm32v1-none`.
3. Deploys `receipt_token.wasm` with the deployer as placeholder admin.
4. Deploys `main_contract.wasm` with `--receipt` and `--token`.
5. Calls `set_admin` on the receipt to hand the mint role to the main contract.
6. Rewrites `NEXT_PUBLIC_MAIN_CONTRACT_ID` and `NEXT_PUBLIC_TOKEN_CONTRACT_ID` in `.env.local`.

## CI

`.github/workflows/ci.yml` runs two jobs on every push and pull request to `main`:
- `frontend`: `npm ci` + `npx tsc --noEmit` + `npm run build`.
- `contract`: `cargo test` against `contract/` with `Swatinem/rust-cache` for the workspace.

## Screenshots

| view                              | preview                |
|-----------------------------------|------------------------|
| desktop hero + slate              | `docs/screenshot-desktop.png` |
| mobile pledge flow                | `docs/screenshot-mobile.png`  |
| cargo test output                 | `docs/screenshot-tests.png`   |

## Notes

- Amounts on chain are i128 stroops. The frontend converts via `xlmToStroops("1.5")` (in `lib/soroban.ts`) so there is no float drift on the boundary.
- Escrow uses the native XLM SAC. `pledge` calls `token.transfer(backer, current_contract_address(), amount)`; `claim` and `refund` call `token.transfer(current_contract_address(), recipient, amount)`. The Soroban host auto-authorizes the contract as `from` when the contract itself is the invocation context, so no explicit `authorize_as_curr_contract` call is needed for the disbursement side.
- Receipts are soulbound by design (no `transfer` method on the receipt contract) because they are proof of patronage, not a transferable asset.
- The contract holds two failure ledger states: `Live` campaigns can transition to `Funded` (via `claim` after a met goal) but never to a `Refunded` status. Refunds are per-backer and zero out individual `Pledge(id, backer)` entries; the campaign as a whole stays `Live` after the deadline, so the UI derives "goal missed" from `now > deadline && pledged < goal`.
- Wallet auth chain: `pledge` requires the backer to sign two auth entries in one prompt (the outer `pledge` call plus the inner native-XLM `transfer`). Soroban's `simulateTransaction` discovers both entries and the SDK threads them through `signTransaction`.
