#!/bin/bash

# Soroban Development Environment Setup
# This script sets up accounts and network configuration for local development

set -e

echo "🔧 Setting up Soroban development environment..."

# Configure testnet network
echo "📡 Adding testnet network configuration..."
soroban network add \
  --global testnet \
  --rpc-url https://soroban-testnet.stellar.org:443 \
  --network-passphrase "Test SDF Network ; September 2015"

# Configure local network for development
echo "🏠 Adding local network configuration..."
soroban network add \
  --global local \
  --rpc-url http://localhost:8000/soroban/rpc \
  --network-passphrase "Standalone Network ; February 2017"

# Generate identity for alice (for testing)
echo "👤 Creating test identity 'alice'..."
soroban keys generate --global alice --network testnet

# Get alice's address
ALICE_ADDRESS=$(soroban keys address alice)
echo "🔑 Alice's address: $ALICE_ADDRESS"

# Fund alice's account on testnet using friendbot
echo "💰 Funding alice's account on testnet..."
curl "https://friendbot.stellar.org/?addr=$ALICE_ADDRESS"

echo ""
echo "✅ Development environment setup completed!"
echo ""
echo "📝 Available commands:"
echo "  soroban keys list - List all keys"
echo "  soroban network list - List all networks"
echo "  ./deploy.sh - Deploy the hello world contract"
echo ""
echo "🔧 Network configurations:"
echo "  testnet: https://soroban-testnet.stellar.org:443"
echo "  local: http://localhost:8000/soroban/rpc (requires local stellar-core)"
echo ""
echo "👤 Test accounts:"
echo "  alice: $ALICE_ADDRESS"
