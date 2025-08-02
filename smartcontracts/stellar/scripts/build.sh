#!/bin/bash

# Build script for Stellar HTLC contract
# Builds the contract for WebAssembly target required by Soroban

set -e

echo "🔨 Building Stellar HTLC Contract..."
echo "=================================="

# Check if Rust and required targets are installed
if ! command -v rustc &> /dev/null; then
    echo "❌ Rust is not installed. Please install Rust first."
    exit 1
fi

# Check if wasm32-unknown-unknown target is installed
if ! rustup target list --installed | grep -q "wasm32-unknown-unknown"; then
    echo "📦 Installing wasm32-unknown-unknown target..."
    rustup target add wasm32-unknown-unknown
fi

# Clean previous builds
echo "🧹 Cleaning previous builds..."
cargo clean

# Build for WebAssembly
echo "🏗️  Building contract..."
cargo build --target wasm32-unknown-unknown --release

# Check if build was successful
if [ -f "target/wasm32-unknown-unknown/release/stellar_htlc.wasm" ]; then
    echo "✅ Build successful!"
    echo "📁 WASM file: target/wasm32-unknown-unknown/release/stellar_htlc.wasm"
    
    # Show file size
    size=$(stat -f%z "target/wasm32-unknown-unknown/release/stellar_htlc.wasm" 2>/dev/null || stat -c%s "target/wasm32-unknown-unknown/release/stellar_htlc.wasm" 2>/dev/null || echo "unknown")
    echo "📏 File size: $size bytes"
else
    echo "❌ Build failed - WASM file not found"
    exit 1
fi

# Run tests
echo ""
echo "🧪 Running tests..."
cargo test --features testutils

echo ""
echo "🎉 Build and test completed successfully!"
echo "🚀 Ready for deployment with Soroban CLI"
