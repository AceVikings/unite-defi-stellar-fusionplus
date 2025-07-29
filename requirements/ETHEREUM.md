# Ethereum HTLC Smart Contract (Solidity)

## Product Description

A trustless Hash Time-Locked Contract (HTLC) deployed on Ethereum to lock ERC-20 tokens (or ETH) with a hashlock and timelock, enabling atomic swaps with Stellar.

## Features

- Deposit/lock tokens by providing hashlock, recipient, timelock
- Claim funds by revealing correct preimage before expiry
- Refund funds by sender after expiry if not claimed
- Event emission for all critical state transitions

## Functional Requirements

### lockFunds

- **Accepts**: token address, amount, recipient, hashlock (SHA-256), timelock (UNIX timestamp)
- **Stores**: new Swap struct, emits Locked
- **Action**: Transfers tokens from sender to contract

### claimFunds

- **Accepts**: swap ID, preimage
- **Checks**: preimage's hash matches hashlock, called before expiry
- **Action**: Transfers tokens to recipient, marks swap completed, emits Claimed

### refundFunds

- **Accepts**: swap ID
- **Checks**: called by original sender, after expiry, unclaimed
- **Action**: Transfers tokens back to sender, emits Refunded

### getSwapData

- **Accepts**: swap ID
- **Returns**: all swap fields for monitoring

## Events

- **Locked**: Emitted when funds are locked with swap details
- **Claimed**: Emitted when funds are claimed with swap details
- **Refunded**: Emitted when funds are refunded with swap details

## Security

- Support reentrancy guard
- Only allow valid ERC-20s
- Input validation
- Ensure no double claims/refunds
- Full test suite (deposits, claims, refunds, edge cases)

## Technical Notes

- Use OpenZeppelin Contracts (ERC-20, security patterns)
- Compatible with MetaMask and EIP-712 for order signing
- Test on Sepolia
