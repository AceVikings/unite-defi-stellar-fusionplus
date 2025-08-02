# Stellar HTLC - Cross-Chain Atomic Swaps

## Overview

This Soroban smart contract implements Hash Time-Locked Contracts (HTLCs) on Stellar, enabling secure cross-chain atomic swaps between Stellar and Ethereum networks. This implementation complements the Enhanced Ethereum CrossChainHTLC contract to provide a complete bidirectional atomic swap solution.

## Features

### Core HTLC Functions
- **Initialize Swap**: Create new HTLC with hashlock/timelock
- **Claim Funds**: Claim locked funds with valid preimage
- **Refund Funds**: Refund expired swaps after timeout

### Enhanced Features
- **Cross-Chain Coordination**: Ethereum transaction hash tracking
- **Resolver Integration**: 1inch Fusion+ resolver support
- **Protocol Fees**: Configurable fee structure
- **Comprehensive Events**: Full event emission for monitoring
- **Security Features**: Reentrancy protection and input validation

## Contract Structure

```
stellar-htlc/
├── src/
│   ├── lib.rs              # Main contract implementation
│   ├── types.rs            # Data structures and types
│   ├── events.rs           # Event definitions
│   ├── errors.rs           # Custom error types
│   ├── storage.rs          # Storage key management
│   └── test.rs             # Comprehensive tests
├── Cargo.toml              # Project configuration
└── README.md               # This file
```

## Quick Start

### Prerequisites
- Rust 1.70+
- Soroban CLI
- Stellar RPC endpoint

### Build
```bash
cargo build --target wasm32-unknown-unknown --release
```

### Test
```bash
cargo test
```

### Deploy
```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stellar_htlc.wasm \
  --source account \
  --network testnet
```

## Contract Functions

### Initialize Swap
```rust
initialize_swap(
    recipient: Address,
    token: Address,
    amount: i128,
    hashlock: BytesN<32>,
    timelock: u64,
    resolver: Option<Address>,
    eth_tx_hash: String
) -> BytesN<32>
```

### Claim Funds
```rust
claim_funds(
    swap_id: BytesN<32>,
    preimage: BytesN<32>
) -> ()
```

### Refund Funds
```rust
refund_funds(
    swap_id: BytesN<32>
) -> ()
```

## Cross-Chain Compatibility

This contract is designed to work seamlessly with the Enhanced Ethereum CrossChainHTLC contract:

- **Identical Hash Functions**: SHA-256 for cross-chain compatibility
- **Compatible Timelock Logic**: Coordinated timeout handling
- **Event Synchronization**: Matching event structures for monitoring
- **Secret Management**: Secure preimage revelation protocol

## Testing

The contract includes comprehensive tests covering:
- Successful swap flows
- Timeout and refund scenarios
- Edge cases and error conditions
- Gas optimization validation
- Cross-chain coordination features

## Integration

For integration examples and detailed API documentation, see:
- [Integration Guide](./INTEGRATION_GUIDE.md)
- [API Reference](./API_REFERENCE.md)
- [Cross-Chain Setup](./CROSS_CHAIN_SETUP.md)

## Security

This contract implements multiple security layers:
- Reentrancy protection
- Input validation
- Access control
- Safe arithmetic operations
- Comprehensive error handling

## License

MIT License - see LICENSE file for details.
