# Folio

Crowdfund: factory + escrow + soulbound supporter badge on Stellar testnet.

```text
network:    Stellar Testnet
passphrase: Test SDF Network ; September 2015
contracts:
  main         CDSM73ALYUJBNR4OK5YVR3AMWHBQCFG6BIB2RV22W7I3C6LPTAPAGDON  (campaign factory + escrow)
  receipt      CAJ6XYN6VRAVPVL353X6QWZHKHOW4COWKQ5GPV5OL2ZXP2H2KFZMH4ST  (SEP-41 supporter badge, soulbound)
  native xlm   CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC  (testnet SAC)
demo:       <Vercel URL>
video:      <Loom URL>
example tx: https://stellar.expert/explorer/testnet/tx/1dccbdb309efb9bd510024024d77accb0ee4cbafbab1b322e4776b9146b3b238
```

Both contract ids land in `.env.local` after running `scripts/deploy.sh alice`. The native XLM Stellar Asset Contract (SAC) is referenced by the main contract at construction time and is not redeployed by this project.

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

1. `app/` — Next.js App Router entry, providers (React Query, wallet context), and editorial-styled hero / stats.
2. `components/` — UI panels (campaign cards, create-campaign form, balance, badges, pledge wire).
3. `hooks/` — React Query bindings to read campaigns, write actions (pledge / claim / refund / create), and stream events.
4. `lib/stellar.ts`, `lib/soroban.ts`, `lib/wallets.ts`, `lib/events.ts`, `lib/errors.ts` — Stellar SDK adapters; explicit module list (no `defaultModules()`).
5. `contract/main` — Soroban Rust crate; campaign factory + escrow + inter-contract mint.
6. `contract/receipt` — Soroban Rust crate; SEP-41-style soulbound supporter badge (no `transfer` exposed).

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

```bash
# install frontend dependencies
npm install

# unit tests for both contracts
cd contract && cargo test && cd ..

# deploy receipt + main + wire receipt admin to main, write ids into .env.local
scripts/deploy.sh alice

# local dev (port 3001 for the crowdfund slot in the fleet)
PORT=3001 npm run dev

# production build (next.js, gates CI)
npm run build
```

`scripts/deploy.sh`:
- resolves the native XLM SAC id with `stellar contract id asset --asset native --network testnet`,
- runs `stellar contract build` for both crates against `wasm32v1-none`,
- deploys `receipt_token.wasm` with the deployer as placeholder admin,
- deploys `main_contract.wasm` with `--receipt` and `--token`,
- calls `set_admin` on the receipt to hand the mint role to the main contract.

`alice` is a `stellar keys` identity; create one with `stellar keys generate alice --network testnet --fund` if it does not exist.

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
