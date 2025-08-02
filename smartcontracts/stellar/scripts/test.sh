#!/bin/bash

# Test script for Stellar HTLC contract
# Runs comprehensive tests with coverage

set -e

echo "🧪 Testing Stellar HTLC Contract..."
echo "=================================="

# Run basic tests
echo "🔬 Running unit tests..."
cargo test --features testutils

# Run tests with verbose output
echo ""
echo "📝 Running tests with verbose output..."
cargo test --features testutils -- --nocapture

# Check code formatting
echo ""
echo "🎨 Checking code formatting..."
cargo fmt --check

# Check for common issues
echo ""
echo "🔍 Running Clippy checks..."
cargo clippy -- -D warnings

# Generate documentation
echo ""
echo "📚 Generating documentation..."
cargo doc --no-deps

echo ""
echo "✅ All tests and checks passed!"
echo "📊 Test summary:"
echo "   - Unit tests: ✅ Passed"
echo "   - Code formatting: ✅ Passed" 
echo "   - Clippy checks: ✅ Passed"
echo "   - Documentation: ✅ Generated"
