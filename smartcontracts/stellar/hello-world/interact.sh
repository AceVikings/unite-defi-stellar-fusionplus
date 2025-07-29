#!/bin/bash

# Contract Interaction Script
# This script demonstrates how to interact with the deployed hello world contract

set -e

# Check if contract ID file exists
if [ ! -f ".contract_id" ]; then
    echo "❌ Contract ID file not found. Please run ./deploy.sh first."
    exit 1
fi

CONTRACT_ID=$(cat .contract_id)
echo "🔗 Using contract ID: $CONTRACT_ID"

# Function to call hello with different names
call_hello() {
    local name=$1
    echo "👋 Calling hello with name: $name"
    
    RESULT=$(soroban contract invoke \
        --id $CONTRACT_ID \
        --source alice \
        --network testnet \
        -- \
        hello \
        --to "$name")
    
    echo "📋 Response: $RESULT"
    echo ""
}

# Test with different names
echo "🧪 Testing contract with different inputs..."
echo ""

call_hello "World"
call_hello "Stellar"
call_hello "Soroban"
call_hello "DeFi"

echo "✅ All tests completed successfully!"
