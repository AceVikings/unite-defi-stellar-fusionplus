# Integration Guide - Stellar HTLC Smart Contract

## Overview

This guide provides comprehensive instructions for integrating the Stellar HTLC contract into your cross-chain swap applications. The contract enables secure atomic swaps between Stellar and Ethereum networks with 1inch Fusion+ support.

## Table of Contents

1. [Quick Integration](#quick-integration)
2. [Detailed Setup](#detailed-setup)
3. [Cross-Chain Workflows](#cross-chain-workflows)
4. [Error Handling](#error-handling)
5. [Best Practices](#best-practices)
6. [Production Checklist](#production-checklist)

## Quick Integration

### 1. Install Dependencies

```bash
npm install @stellar/stellar-sdk
# or
yarn add @stellar/stellar-sdk
```

### 2. Basic Integration

```javascript
const StellarSdk = require('@stellar/stellar-sdk');

class StellarHTLCClient {
    constructor(contractId, serverUrl, networkPassphrase) {
        this.contractId = contractId;
        this.server = new StellarSdk.SorobanRpc.Server(serverUrl);
        this.networkPassphrase = networkPassphrase;
        this.contract = new StellarSdk.Contract(contractId);
    }
    
    async createSwap(params) {
        const { 
            senderKeypair, 
            recipient, 
            token, 
            amount, 
            hashlock, 
            timelock, 
            resolverId 
        } = params;
        
        // Load sender account
        const senderAccount = await this.server.getAccount(senderKeypair.publicKey());
        
        // Build transaction
        const transaction = new StellarSdk.TransactionBuilder(senderAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: this.networkPassphrase
        })
            .addOperation(this.contract.call(
                'create_swap',
                StellarSdk.Address.fromString(recipient).toScVal(),
                StellarSdk.Address.fromString(token).toScVal(),
                StellarSdk.nativeToScVal(amount, { type: 'i128' }),
                StellarSdk.nativeToScVal(hashlock, { type: 'bytes' }),
                StellarSdk.nativeToScVal(timelock, { type: 'u64' }),
                StellarSdk.nativeToScVal(resolverId || '', { type: 'string' })
            ))
            .setTimeout(30)
            .build();
        
        // Sign and submit
        transaction.sign(senderKeypair);
        return await this.server.sendTransaction(transaction);
    }
    
    async claimSwap(swapId, preimage, claimerKeypair) {
        const claimerAccount = await this.server.getAccount(claimerKeypair.publicKey());
        
        const transaction = new StellarSdk.TransactionBuilder(claimerAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: this.networkPassphrase
        })
            .addOperation(this.contract.call(
                'claim_swap',
                StellarSdk.nativeToScVal(swapId, { type: 'string' }),
                StellarSdk.nativeToScVal(preimage, { type: 'bytes' })
            ))
            .setTimeout(30)
            .build();
        
        transaction.sign(claimerKeypair);
        return await this.server.sendTransaction(transaction);
    }
    
    async getSwap(swapId) {
        const dummyAccount = new StellarSdk.Account(
            StellarSdk.Keypair.random().publicKey(), 
            '0'
        );
        
        const transaction = new StellarSdk.TransactionBuilder(dummyAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: this.networkPassphrase
        })
            .addOperation(this.contract.call(
                'get_swap',
                StellarSdk.nativeToScVal(swapId, { type: 'string' })
            ))
            .setTimeout(30)
            .build();
        
        const result = await this.server.simulateTransaction(transaction);
        
        if (result.result) {
            return StellarSdk.scValToNative(result.result.retval);
        }
        return null;
    }
}
```

## Detailed Setup

### 1. Environment Configuration

Create a configuration file for different environments:

```javascript
// config.js
const configs = {
    testnet: {
        stellarRpc: 'https://soroban-testnet.stellar.org',
        stellarHorizon: 'https://horizon-testnet.stellar.org',
        networkPassphrase: StellarSdk.Networks.TESTNET,
        contractId: process.env.STELLAR_HTLC_TESTNET_CONTRACT_ID
    },
    mainnet: {
        stellarRpc: 'https://soroban-mainnet.stellar.org',
        stellarHorizon: 'https://horizon.stellar.org',
        networkPassphrase: StellarSdk.Networks.PUBLIC,
        contractId: process.env.STELLAR_HTLC_MAINNET_CONTRACT_ID
    }
};

module.exports = configs;
```

### 2. Enhanced Client Implementation

```javascript
const crypto = require('crypto');
const EventEmitter = require('events');

class EnhancedStellarHTLCClient extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.server = new StellarSdk.SorobanRpc.Server(config.stellarRpc);
        this.horizonServer = new StellarSdk.Horizon.Server(config.stellarHorizon);
        this.contract = new StellarSdk.Contract(config.contractId);
    }
    
    // Generate cryptographically secure secret and hash
    generateSecret() {
        const secret = crypto.randomBytes(32);
        const hash = crypto.createHash('sha256').update(secret).digest();
        
        return {
            secret: secret.toString('hex'),
            hash: hash.toString('hex'),
            hashBytes: hash
        };
    }
    
    // Validate swap parameters
    validateSwapParams(params) {
        const { recipient, amount, timelock, hashlock } = params;
        
        if (!StellarSdk.StrKey.isValidEd25519PublicKey(recipient)) {
            throw new Error('Invalid recipient address');
        }
        
        if (amount <= 0) {
            throw new Error('Amount must be positive');
        }
        
        if (timelock <= Math.floor(Date.now() / 1000)) {
            throw new Error('Timelock must be in the future');
        }
        
        if (!hashlock || hashlock.length !== 64) {
            throw new Error('Invalid hashlock');
        }
    }
    
    // Create swap with comprehensive error handling
    async createSwap(params) {
        try {
            this.validateSwapParams(params);
            
            const result = await this.createSwapTransaction(params);
            
            if (result.status === 'SUCCESS') {
                this.emit('swapCreated', {
                    txHash: result.hash,
                    swapId: this.extractSwapId(result),
                    params
                });
                
                return {
                    success: true,
                    txHash: result.hash,
                    swapId: this.extractSwapId(result)
                };
            } else {
                throw new Error(`Transaction failed: ${result.status}`);
            }
            
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
    
    // Monitor swap status
    async monitorSwap(swapId, callback) {
        const pollInterval = 5000; // 5 seconds
        
        const checkStatus = async () => {
            try {
                const swap = await this.getSwap(swapId);
                
                if (swap) {
                    callback(null, swap);
                    
                    if (swap.status === 'Claimed' || swap.status === 'Refunded') {
                        return; // Stop monitoring
                    }
                }
                
                // Continue monitoring
                setTimeout(checkStatus, pollInterval);
                
            } catch (error) {
                callback(error, null);
            }
        };
        
        checkStatus();
    }
    
    // Extract swap ID from transaction result
    extractSwapId(result) {
        // Parse events or return value to get actual swap ID
        // For demo purposes, generate a placeholder
        return `swap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Estimate fees for swap creation
    async estimateSwapFees(params) {
        try {
            const dummyKeypair = StellarSdk.Keypair.random();
            const dummyAccount = new StellarSdk.Account(dummyKeypair.publicKey(), '0');
            
            const transaction = new StellarSdk.TransactionBuilder(dummyAccount, {
                fee: StellarSdk.BASE_FEE,
                networkPassphrase: this.config.networkPassphrase
            })
                .addOperation(this.buildCreateSwapOperation(params))
                .setTimeout(30)
                .build();
            
            const simulation = await this.server.simulateTransaction(transaction);
            
            return {
                networkFee: simulation.cost?.cpuInsns || 0,
                protocolFee: await this.getProtocolFee(),
                totalEstimate: simulation.cost?.cpuInsns + await this.getProtocolFee()
            };
            
        } catch (error) {
            throw new Error(`Fee estimation failed: ${error.message}`);
        }
    }
    
    // Get current protocol fee
    async getProtocolFee() {
        try {
            const dummyAccount = new StellarSdk.Account(
                StellarSdk.Keypair.random().publicKey(), 
                '0'
            );
            
            const transaction = new StellarSdk.TransactionBuilder(dummyAccount, {
                fee: StellarSdk.BASE_FEE,
                networkPassphrase: this.config.networkPassphrase
            })
                .addOperation(this.contract.call('get_protocol_fee'))
                .setTimeout(30)
                .build();
            
            const result = await this.server.simulateTransaction(transaction);
            
            if (result.result) {
                return StellarSdk.scValToNative(result.result.retval);
            }
            return 30; // Default 0.3%
            
        } catch (error) {
            return 30; // Fallback
        }
    }
}
```

## Cross-Chain Workflows

### 1. Stellar → Ethereum Atomic Swap

```javascript
async function stellarToEthereumSwap(params) {
    const {
        stellarSender,
        ethereumRecipient,
        stellarToken,
        ethereumToken,
        amount,
        timelock
    } = params;
    
    // 1. Generate secret
    const { secret, hash } = stellarClient.generateSecret();
    
    // 2. Create Stellar swap (sender locks funds)
    const stellarSwap = await stellarClient.createSwap({
        senderKeypair: stellarSender,
        recipient: ethereumRecipient.stellarAddress,
        token: stellarToken,
        amount,
        hashlock: hash,
        timelock,
        resolverId: '1inch_fusion_plus'
    });
    
    // 3. Create Ethereum swap (recipient locks funds)
    const ethereumSwap = await ethereumContract.createSwap(
        stellarSender.ethereumAddress,
        ethereumToken,
        amount,
        '0x' + hash,
        timelock,
        { value: ethers.parseEther('0.01') }
    );
    
    // 4. Stellar sender claims Ethereum funds (reveals secret)
    const ethereumClaim = await ethereumContract.claimSwap(
        ethereumSwap.swapId,
        '0x' + secret
    );
    
    // 5. Ethereum recipient uses revealed secret to claim Stellar funds
    const stellarClaim = await stellarClient.claimSwap(
        stellarSwap.swapId,
        Buffer.from(secret, 'hex'),
        ethereumRecipient.stellarKeypair
    );
    
    return {
        stellarSwapId: stellarSwap.swapId,
        ethereumSwapId: ethereumSwap.swapId,
        secret,
        completed: true
    };
}
```

### 2. Ethereum → Stellar Atomic Swap

```javascript
async function ethereumToStellarSwap(params) {
    const {
        ethereumSender,
        stellarRecipient,
        ethereumToken,
        stellarToken,
        amount,
        timelock
    } = params;
    
    // 1. Generate secret
    const { secret, hash } = stellarClient.generateSecret();
    
    // 2. Create Ethereum swap (sender locks funds)
    const ethereumSwap = await ethereumContract.createSwap(
        stellarRecipient.ethereumAddress,
        ethereumToken,
        amount,
        '0x' + hash,
        timelock,
        { value: ethers.parseEther('0.01') }
    );
    
    // 3. Create Stellar swap (recipient locks funds)
    const stellarSwap = await stellarClient.createSwap({
        senderKeypair: stellarRecipient,
        recipient: ethereumSender.stellarAddress,
        token: stellarToken,
        amount,
        hashlock: hash,
        timelock,
        resolverId: '1inch_fusion_plus'
    });
    
    // 4. Stellar recipient claims Ethereum funds (reveals secret)
    const ethereumClaim = await ethereumContract.claimSwap(
        ethereumSwap.swapId,
        '0x' + secret
    );
    
    // 5. Ethereum sender uses revealed secret to claim Stellar funds
    const stellarClaim = await stellarClient.claimSwap(
        stellarSwap.swapId,
        Buffer.from(secret, 'hex'),
        ethereumSender.stellarKeypair
    );
    
    return {
        ethereumSwapId: ethereumSwap.swapId,
        stellarSwapId: stellarSwap.swapId,
        secret,
        completed: true
    };
}
```

## Error Handling

### 1. Contract Error Mapping

```javascript
const HTLC_ERRORS = {
    1001: 'InvalidTimelock',
    1002: 'SwapNotFound',
    1003: 'SwapAlreadyClaimed',
    1004: 'SwapExpired',
    1005: 'InvalidPreimage',
    1006: 'Unauthorized',
    1007: 'InvalidFee',
    1008: 'InsufficientBalance',
    1009: 'TransferFailed',
    1010: 'ResolverNotFound'
};

function parseContractError(error) {
    const errorCode = extractErrorCode(error);
    return {
        code: errorCode,
        name: HTLC_ERRORS[errorCode] || 'UnknownError',
        message: error.message,
        isRetryable: isRetryableError(errorCode)
    };
}

function isRetryableError(errorCode) {
    const retryableErrors = [1008, 1009]; // InsufficientBalance, TransferFailed
    return retryableErrors.includes(errorCode);
}
```

### 2. Comprehensive Error Handling

```javascript
async function safeCreateSwap(params, retryOptions = {}) {
    const { maxRetries = 3, retryDelay = 1000 } = retryOptions;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await stellarClient.createSwap(params);
            
        } catch (error) {
            const parsedError = parseContractError(error);
            
            console.log(`Attempt ${attempt} failed:`, parsedError);
            
            if (!parsedError.isRetryable || attempt === maxRetries) {
                throw new Error(`Swap creation failed: ${parsedError.name}`);
            }
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
    }
}
```

## Best Practices

### 1. Security Considerations

```javascript
// Always validate inputs
function validateSwapInputs(params) {
    const { amount, timelock, hashlock } = params;
    
    // Minimum timelock buffer (1 hour)
    const minTimelock = Math.floor(Date.now() / 1000) + 3600;
    if (timelock < minTimelock) {
        throw new Error('Timelock too short - minimum 1 hour buffer required');
    }
    
    // Maximum timelock (24 hours)
    const maxTimelock = Math.floor(Date.now() / 1000) + (24 * 3600);
    if (timelock > maxTimelock) {
        throw new Error('Timelock too long - maximum 24 hours allowed');
    }
    
    // Validate amount
    if (amount <= 0 || amount > Number.MAX_SAFE_INTEGER) {
        throw new Error('Invalid amount');
    }
    
    // Validate hashlock format
    if (!/^[0-9a-fA-F]{64}$/.test(hashlock)) {
        throw new Error('Invalid hashlock format');
    }
}

// Secure secret generation
function generateSecureSecret() {
    // Use cryptographically secure random number generator
    const secret = crypto.randomBytes(32);
    
    // Verify randomness quality
    const entropy = calculateEntropy(secret);
    if (entropy < 250) { // Bits of entropy
        throw new Error('Insufficient entropy in generated secret');
    }
    
    return secret;
}
```

### 2. Gas Optimization

```javascript
// Batch operations when possible
async function batchOperations(operations) {
    const account = await server.getAccount(keypair.publicKey());
    
    const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE * operations.length,
        networkPassphrase: config.networkPassphrase
    });
    
    operations.forEach(op => transaction.addOperation(op));
    
    return await server.sendTransaction(
        transaction.setTimeout(30).build().sign(keypair)
    );
}

// Optimize storage usage
function optimizeSwapData(swapData) {
    // Remove unnecessary fields
    const optimized = {
        recipient: swapData.recipient,
        amount: swapData.amount,
        hashlock: swapData.hashlock,
        timelock: swapData.timelock
    };
    
    // Use efficient encoding
    return compressSwapData(optimized);
}
```

### 3. Monitoring and Logging

```javascript
class SwapMonitor {
    constructor(stellarClient) {
        this.client = stellarClient;
        this.activeSwaps = new Map();
    }
    
    trackSwap(swapId, metadata) {
        this.activeSwaps.set(swapId, {
            ...metadata,
            createdAt: Date.now(),
            status: 'active'
        });
        
        this.scheduleStatusCheck(swapId);
    }
    
    scheduleStatusCheck(swapId) {
        setTimeout(async () => {
            try {
                const swap = await this.client.getSwap(swapId);
                
                if (swap && swap.status !== 'Active') {
                    this.activeSwaps.delete(swapId);
                    this.logSwapCompletion(swapId, swap.status);
                } else {
                    this.scheduleStatusCheck(swapId); // Continue monitoring
                }
                
            } catch (error) {
                console.error(`Error checking swap ${swapId}:`, error);
            }
        }, 30000); // Check every 30 seconds
    }
    
    logSwapCompletion(swapId, status) {
        console.log(`Swap ${swapId} completed with status: ${status}`);
        
        // Send to analytics/monitoring service
        this.sendAnalytics({
            event: 'swap_completed',
            swapId,
            status,
            timestamp: Date.now()
        });
    }
}
```

## Production Checklist

### Pre-Deployment
- [ ] Contract code audited by security professionals
- [ ] Comprehensive test suite passing (unit, integration, stress tests)
- [ ] Gas optimization verified
- [ ] Error handling tested for all edge cases
- [ ] Cross-chain integration tested on testnets

### Deployment
- [ ] Environment configuration validated
- [ ] Deployment keys secured (hardware wallet recommended)
- [ ] Contract deployed to testnet first
- [ ] Integration tests passing on testnet
- [ ] Mainnet deployment with minimal initial limits
- [ ] Contract verification completed

### Post-Deployment
- [ ] Monitoring systems active
- [ ] Analytics tracking implemented
- [ ] Emergency procedures documented
- [ ] Team trained on operational procedures
- [ ] User documentation published
- [ ] Community support channels established

### Ongoing Operations
- [ ] Regular security reviews
- [ ] Performance monitoring
- [ ] User feedback collection
- [ ] Upgrade planning (if needed)
- [ ] Incident response procedures tested

## Support and Resources

### Documentation
- [Stellar Soroban Docs](https://soroban.stellar.org/docs)
- [Stellar SDK Reference](https://stellar.github.io/js-stellar-sdk/)
- [Cross-Chain Best Practices](./CROSS_CHAIN_BEST_PRACTICES.md)

### Community
- [Stellar Discord](https://discord.gg/stellar)
- [GitHub Discussions](https://github.com/stellar/soroban-docs/discussions)

### Professional Support
- Email: support@unite-defi.com
- Telegram: @unite_defi_support

---

*This integration guide is maintained by the Unite DeFi team. For updates and additional resources, visit our GitHub repository.*
