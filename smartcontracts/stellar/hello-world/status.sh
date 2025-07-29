#!/bin/bash

# Check Contract Status Script
# This script provides useful information about the deployed contract

set -e

# Check if contract ID file exists
if [ ! -f ".contract_id" ]; then
    echo "❌ Contract ID file not found. Please run ./deploy.sh first."
    exit 1
fi

CONTRACT_ID=$(cat .contract_id)
echo "🔗 Contract ID: $CONTRACT_ID"
echo ""

# Get contract information
echo "📊 Contract Information:"
echo "   Explorer: https://stellar.expert/explorer/testnet/contract/$CONTRACT_ID"
echo ""

# Check alice's account info
ALICE_ADDRESS=$(soroban keys address alice)
echo "👤 Alice's Account:"
echo "   Address: $ALICE_ADDRESS"
echo "   Explorer: https://stellar.expert/explorer/testnet/account/$ALICE_ADDRESS"
echo ""

# List available networks
echo "🌐 Configured Networks:"
soroban network list
echo ""

# List available keys
echo "🔑 Available Identities:"
soroban keys list
echo ""

echo "🛠️ Useful Commands:"
echo "   Deploy:    ./deploy.sh"
echo "   Interact:  ./interact.sh"
echo "   Test:      cargo test"
echo "   Build:     soroban contract build"
echo ""
echo "📚 Resources:"
echo "   Contract Explorer: https://stellar.expert/explorer/testnet/contract/$CONTRACT_ID"
echo "   Soroban Docs: https://soroban.stellar.org/docs"
echo "   This Project: $(pwd)"
