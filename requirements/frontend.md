# Frontend UI Dashboard

## Product Description

A UI dashboard for users (makers/takers/resolvers) to initiate swaps, sign orders, monitor status, and interact with contracts on both Ethereum and Stellar.

## Features

- Wallet connectors for Ethereum (MetaMask, WalletConnect, etc.)
- Stellar account authentication (Secret key/SEP7/Albedo/Freighter)
- Swap creation wizard: Choose asset, amount, chains, swap direction
- Order signing: EIP-712 for Ethereum, Soroban transaction builder for Stellar
- Live swap status: Progress bar, event logs, error messages
- Refund/cancellation action if swap times out
- Order book/History display (optional: show all open and past swaps)
- Settings: Slippage tolerance, min amount, custom timeouts

## Functional Requirements

### Account Connection

- Support connecting to both Ethereum and Stellar accounts
- Display balances, allow selecting tokens/assets

### Swap Creation Flow

- Form to input swap amounts, assets, destination chain
- Helper text to guide "hashlock"/"timelock"-based swaps
- Generates and signs order via EIP-712 (MetaMask popup)
- Handles Soroban signatures/transactions similarly

### Monitoring & Alerts

- Poll backend for swap state; reflect contract event statuses in UI
- Clearly show swap progress, next steps, and when/if user action is needed

### Refund Action

- Automatic or on-demand "refund" button if swap expires

### Order Book

- Display active/past swaps, with filtering and search

## Technical Notes

- Use wagmi, ethers.js, or web3.js for Ethereum contract calls
- Use Stellar SDK and Soroban kit for Stellar contracts
- Integrate with backend via REST/WebSocket
- Mobile and desktop responsive
- Accessible design and clear warnings on security (never share private keys)
