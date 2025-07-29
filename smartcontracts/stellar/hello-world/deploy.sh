#!/bin/bash

# Soroban Hello World Deployment Script
# This script builds, deploys, and interacts with the hello world contract

set -e

echo "🔨 Building contract..."
soroban contract build

echo "📦 Optimizing WASM..."
soroban contract optimize --wasm target/wasm32-unknown-unknown/release/hello_world.wasm

echo "🚀 Deploying to local testnet..."
# Deploy the contract and capture the contract ID
CONTRACT_ID=$(soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/hello_world.wasm \
  --source alice \
  --network testnet)

echo "✅ Contract deployed with ID: $CONTRACT_ID"

# Save contract ID for future interactions
echo $CONTRACT_ID > .contract_id

echo "🎯 Testing contract interaction..."
# Call the hello function
RESULT=$(soroban contract invoke \
  --id $CONTRACT_ID \
  --source alice \
  --network testnet \
  -- \
  hello \
  --to "Stellar")

echo "📋 Contract response: $RESULT"

echo "🎉 Deployment and test completed successfully!"
echo "Contract ID saved to .contract_id file"
