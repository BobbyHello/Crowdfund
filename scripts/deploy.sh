#!/usr/bin/env bash
# Build + deploy contracts to Stellar testnet, write contract ids into .env.local.
#
# Crowdfund layout (uses_custom_token: true, uses_inter_contract: true):
#   1. Resolve the native XLM Stellar Asset Contract id on testnet (and ensure it is
#      installed on this network if it is not already).
#   2. Build + deploy the receipt SEP-41 token with the deployer as placeholder admin.
#   3. Build + deploy the main contract with --receipt and --token (native XLM SAC).
#   4. Hand the receipt admin role over to the main contract so pledges can mint.
#
# Usage: scripts/deploy.sh [stellar-key-name]   (default: alice)

set -euo pipefail

cd "$(dirname "$0")/.."

SOURCE="${1:-alice}"
NETWORK="testnet"
ENV_FILE=.env.local

ADMIN=$(stellar keys address "$SOURCE")
echo "==> deployer: $ADMIN"

write_env() {
  local key="$1" value="$2"
  if [ -f "$ENV_FILE" ] && grep -q "^$key=" "$ENV_FILE"; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^$key=.*|$key=$value|" "$ENV_FILE"
    else
      sed -i "s|^$key=.*|$key=$value|" "$ENV_FILE"
    fi
  else
    echo "$key=$value" >> "$ENV_FILE"
  fi
}

echo "==> resolving native XLM stellar asset contract"
# deploy is a no-op when the SAC is already installed on the network
stellar contract asset deploy --asset native --network "$NETWORK" --source-account "$SOURCE" >/dev/null 2>&1 || true
XLM=$(stellar contract id asset --asset native --network "$NETWORK")
[[ "$XLM" =~ ^C[A-Z0-9]{55}$ ]] || { echo "could not resolve native XLM SAC: $XLM"; exit 1; }
echo "    -> $XLM"

echo "==> building receipt"
stellar contract build --manifest-path contract/receipt/Cargo.toml >/dev/null
RECEIPT_WASM=contract/target/wasm32v1-none/release/receipt_token.wasm

echo "==> deploying receipt token (admin: deployer for now)"
RECEIPT=$(stellar contract deploy \
  --wasm "$RECEIPT_WASM" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- --admin "$ADMIN" \
  2>&1 | tail -1)
[[ "$RECEIPT" =~ ^C[A-Z0-9]{55}$ ]] || { echo "receipt deploy failed: $RECEIPT"; exit 1; }
echo "    -> $RECEIPT"

echo "==> building main"
stellar contract build --manifest-path contract/main/Cargo.toml >/dev/null
MAIN_WASM=contract/target/wasm32v1-none/release/main_contract.wasm

echo "==> deploying main contract"
MAIN=$(stellar contract deploy \
  --wasm "$MAIN_WASM" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- --receipt "$RECEIPT" --token "$XLM" \
  2>&1 | tail -1)
[[ "$MAIN" =~ ^C[A-Z0-9]{55}$ ]] || { echo "main deploy failed: $MAIN"; exit 1; }
echo "    -> $MAIN"

echo "==> transferring receipt admin to main contract"
stellar contract invoke \
  --id "$RECEIPT" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- set_admin --new_admin "$MAIN" >/dev/null

write_env NEXT_PUBLIC_MAIN_CONTRACT_ID "$MAIN"
write_env NEXT_PUBLIC_TOKEN_CONTRACT_ID "$RECEIPT"

echo "==> wrote ids to $ENV_FILE"
echo
echo "main:    https://stellar.expert/explorer/testnet/contract/$MAIN"
echo "token:   https://stellar.expert/explorer/testnet/contract/$RECEIPT"
echo "xlm SAC: https://stellar.expert/explorer/testnet/contract/$XLM"
