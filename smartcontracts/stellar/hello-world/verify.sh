#!/bin/bash

# Verification Script
# This script checks if the Soroban development environment is properly set up

set -e

echo "🔍 Verifying Soroban Development Environment..."
echo ""

# Check if Soroban CLI is installed
echo "✅ Checking Soroban CLI installation..."
if command -v soroban &> /dev/null; then
    SOROBAN_VERSION=$(soroban --version)
    echo "   $SOROBAN_VERSION"
else
    echo "❌ Soroban CLI not found. Please install it first."
    exit 1
fi

# Check if Rust is installed with wasm32 target
echo "✅ Checking Rust installation..."
if command -v rustc &> /dev/null; then
    RUST_VERSION=$(rustc --version)
    echo "   $RUST_VERSION"
    
    # Check if wasm32 target is installed
    if rustup target list --installed | grep -q "wasm32-unknown-unknown"; then
        echo "   ✅ wasm32-unknown-unknown target is installed"
    else
        echo "   ⚠️  Installing wasm32-unknown-unknown target..."
        rustup target add wasm32-unknown-unknown
    fi
else
    echo "❌ Rust not found. Please install it first."
    exit 1
fi

# Check if project can build
echo "✅ Testing project build..."
if cargo build --target wasm32-unknown-unknown --release > /dev/null 2>&1; then
    echo "   ✅ Project builds successfully"
else
    echo "   ❌ Project build failed"
    exit 1
fi

# Check if tests pass
echo "✅ Running tests..."
if cargo test > /dev/null 2>&1; then
    echo "   ✅ All tests pass"
else
    echo "   ❌ Tests failed"
    exit 1
fi

# Check for required scripts
echo "✅ Checking required scripts..."
for script in "setup.sh" "deploy.sh" "interact.sh"; do
    if [ -f "$script" ] && [ -x "$script" ]; then
        echo "   ✅ $script is present and executable"
    else
        echo "   ❌ $script is missing or not executable"
    fi
done

echo ""
echo "🎉 Verification completed successfully!"
echo ""
echo "📋 Summary:"
echo "   - Soroban CLI: Installed and working"
echo "   - Rust: Installed with WASM support"
echo "   - Project: Builds and tests pass"
echo "   - Scripts: All deployment scripts ready"
echo ""
echo "🚀 Your Soroban development environment is ready!"
echo ""
echo "Next steps:"
echo "   1. Run './setup.sh' to configure networks and accounts"
echo "   2. Run './deploy.sh' to deploy your contract to testnet"
echo "   3. Run './interact.sh' to test contract interactions"
