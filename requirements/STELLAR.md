# Stellar Soroban HTLC Contract (Rust/Soroban)

## Product Description

A Soroban smart contract mirroring the Ethereum HTLC, managing native Stellar tokens or Stellar-issued assets under hashlock and timelock conditions.

## Features

- Deposit tokens under hashlock, recipient, timelock
- Claim by providing the correct preimage within deadline
- Refund if expired, by sender
- Emits log entries for off-chain agents/frontends

## Functional Requirements

### initializeSwap

- **Inputs:** asset ID, amount, recipient, hashlock (SHA-256), timelock (Ledger timestamp)
- **Stores:** swap struct, emits Initialized
- **Locks:** assets from sender

### claim

- **Inputs:** swap ID, preimage
- **Checks:** correct preimage, within timelock
- **Transfers:** asset to recipient, emits Claimed

### refund

- **Inputs:** swap ID
- **Checks:** called by sender, after expiry, not claimed
- **Transfers:** asset to sender, emits Refunded

### viewSwap

- **Inputs:** swap ID
- **Returns:** swap details

## Events

- Initialized, Claimed, Refunded logged to event stream

## Security

- Use SHA-256 with fixed input size for compatible hashes
- Guard against replay, double spends, invalid asset
- Unit/integration tests on Stellar testnet

## Technical Notes

- Use Soroban CLI/scaffold and deploy to Stellar testnet (Futurenet or mainnet as available)
- Support for XLM and Stellar token assets (via Asset ID)
- Handle Soroban state cleanup and rent
