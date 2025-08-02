#!/bin/bash

# Deployment script for Stellar HTLC contract on Testnet
# Requires Soroban CLI to be installed and configured

set -e

echo "🚀 Deploying Stellar HTLC Contract to Testnet..."
echo "=============================================="

# Check if soroban CLI is installed
if ! command -v soroban &> /dev/null; then
    echo "❌ Soroban CLI is not installed."
    echo "📖 Install instructions: https://soroban.stellar.org/docs/getting-started/setup"
    exit 1
fi

# Configuration
NETWORK="testnet"
WASM_FILE="target/wasm32-unknown-unknown/release/stellar_htlc.wasm"
CONTRACT_NAME="stellar-htlc"

# Check if WASM file exists
if [ ! -f "$WASM_FILE" ]; then
    echo "❌ WASM file not found: $WASM_FILE"
    echo "🔨 Run build script first: ./scripts/build.sh"
    exit 1
fi

# Deploy contract
echo "📦 Deploying contract..."
CONTRACT_ADDRESS=$(soroban contract deploy \
    --wasm "$WASM_FILE" \
    --source account \
    --network "$NETWORK")

if [ -z "$CONTRACT_ADDRESS" ]; then
    echo "❌ Deployment failed"
    exit 1
fi

echo "✅ Contract deployed successfully!"
echo "📍 Contract Address: $CONTRACT_ADDRESS"

# Save deployment info
cat > deployment-info.json << EOF
{
  "network": "$NETWORK",
  "contractAddress": "$CONTRACT_ADDRESS",
  "wasmFile": "$WASM_FILE",
  "deployedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "deployedBy": "$(soroban config identity ls | head -1)"
}
EOF

echo "💾 Deployment info saved to deployment-info.json"

# Initialize contract (optional - uncomment if you want to auto-initialize)
# echo "🔧 Initializing contract..."
# ADMIN_ADDRESS="YOUR_ADMIN_ADDRESS"
# FEE_RECIPIENT="YOUR_FEE_RECIPIENT_ADDRESS"
# PROTOCOL_FEE_BPS=30
# 
# soroban contract invoke \
#     --id "$CONTRACT_ADDRESS" \
#     --source account \
#     --network "$NETWORK" \
#     -- \
#     initialize \
#     --admin "$ADMIN_ADDRESS" \
#     --fee_recipient "$FEE_RECIPIENT" \
#     --protocol_fee_bps "$PROTOCOL_FEE_BPS"

echo ""
echo "🎉 Deployment completed!"
echo "📋 Next steps:"
echo "   1. Initialize the contract with initialize() function"
echo "   2. Register resolvers if using 1inch Fusion+ integration"
echo "   3. Test with small amounts first"
echo "   4. Update frontend configuration with contract address"
