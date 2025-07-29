# Cross-Chain Relayer/Resolver Backend Service

## Product Description

A backend bot/service coordinating swap lifecycle, safely relaying events and secrets, off-chain order intents, and managing atomicity between Ethereum and Stellar.

## Features

- Listens for new swap orders/intents (from frontend or relay API)
- Submits and tracks HTLC contract creations on both chains
- Monitors all HTLC events: creation, claim, refund
- Automatically propagates secrets/preimages as revealed
- Handles errors and edge cases (timeouts, failed swaps)

## Functional Requirements

### Order Intake

- Receives order intents from frontend (user signs order via EIP-712, specifies all params)
- Stores order under unique ID

### HTLC Creation

- Deposits user's tokens into Ethereum HTLC
- After confirmation, deposits resolver's tokens into Stellar HTLC

### Event Monitoring

- Subscribes to Ethereum events (web3.js/ethers.js)
- Subscribes to Stellar events (Soroban/RPC or classic Horizon events)

### Secret Propagation

- When user (or counterparty) claims on one chain and reveals preimage, relayer observes event, captures preimage, and submits claim on the second chain

### Timeout/Refund Management

- Monitors expiration and invokes refund method if not claimed in time

### Logging & Status API

- Provides REST endpoints/WebSocket feed for swap status, events, and health
- Dashboards for current/past swaps

## Technical Notes

- Written in Node.js, Python, or Rust
- Use private keys with hardware wallets or secure enclave for automation but never store secrets in plain text
- Handles retries and conflict resolution
- Support for public testnets and migration to mainnets