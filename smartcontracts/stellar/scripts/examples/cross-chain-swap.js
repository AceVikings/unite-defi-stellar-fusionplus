#!/usr/bin/env node

/**
 * Cross-Chain Atomic Swap Example
 * 
 * This example demonstrates how to perform a cross-chain atomic swap
 * between Stellar and Ethereum using the Unite DeFi HTLC contracts.
 */

const StellarSdk = require('@stellar/stellar-sdk');
const { ethers } = require('ethers');
const crypto = require('crypto');

// Configuration
const STELLAR_CONFIG = {
    server: 'https://soroban-testnet.stellar.org',
    horizon: 'https://horizon-testnet.stellar.org',
    passphrase: StellarSdk.Networks.TESTNET,
    contractId: process.env.STELLAR_HTLC_CONTRACT_ID
};

const ETHEREUM_CONFIG = {
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://sepolia.infura.io/v3/your-key',
    contractAddress: process.env.ETHEREUM_HTLC_CONTRACT_ADDRESS,
    chainId: 11155111 // Sepolia testnet
};

class CrossChainSwap {
    constructor() {
        this.stellarServer = new StellarSdk.SorobanRpc.Server(STELLAR_CONFIG.server);
        this.horizonServer = new StellarSdk.Horizon.Server(STELLAR_CONFIG.horizon);
        
        if (ETHEREUM_CONFIG.rpcUrl) {
            this.ethProvider = new ethers.JsonRpcProvider(ETHEREUM_CONFIG.rpcUrl);
        }
    }
    
    /**
     * Generate a secret and its hash for the HTLC
     */
    generateSecret() {
        const secret = crypto.randomBytes(32);
        const hash = crypto.createHash('sha256').update(secret).digest();
        
        return {
            secret: secret.toString('hex'),
            hash: hash.toString('hex'),
            hashBytes32: '0x' + hash.toString('hex')
        };
    }
    
    /**
     * Create a swap on Stellar (initiator side)
     */
    async createStellarSwap(params) {
        const {
            initiatorKeypair,
            recipient,
            tokenAddress,
            amount,
            hashlock,
            timelock,
            resolverId
        } = params;
        
        console.log('🌟 Creating Stellar swap...');
        
        try {
            // Load initiator account
            const initiatorAccount = await this.horizonServer.loadAccount(
                initiatorKeypair.publicKey()
            );
            
            // Build contract call transaction
            const contract = new StellarSdk.Contract(STELLAR_CONFIG.contractId);
            
            const operation = contract.call(
                'create_swap',
                StellarSdk.Address.fromString(recipient).toScVal(),
                StellarSdk.Address.fromString(tokenAddress).toScVal(),
                StellarSdk.nativeToScVal(amount, { type: 'i128' }),
                StellarSdk.nativeToScVal(Buffer.from(hashlock, 'hex'), { type: 'bytes' }),
                StellarSdk.nativeToScVal(timelock, { type: 'u64' }),
                StellarSdk.nativeToScVal(resolverId || '', { type: 'string' })
            );
            
            const transaction = new StellarSdk.TransactionBuilder(initiatorAccount, {
                fee: StellarSdk.BASE_FEE,
                networkPassphrase: STELLAR_CONFIG.passphrase
            })
                .addOperation(operation)
                .setTimeout(30)
                .build();
            
            transaction.sign(initiatorKeypair);
            
            const result = await this.stellarServer.sendTransaction(transaction);
            
            if (result.status === 'SUCCESS') {
                console.log('✅ Stellar swap created:', result.hash);
                return {
                    success: true,
                    txHash: result.hash,
                    swapId: this.extractSwapIdFromResult(result)
                };
            } else {
                throw new Error(`Transaction failed: ${result.status}`);
            }
            
        } catch (error) {
            console.error('❌ Failed to create Stellar swap:', error.message);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Claim a swap on Stellar (recipient side)
     */
    async claimStellarSwap(params) {
        const { swapId, secret, recipientKeypair } = params;
        
        console.log('🌟 Claiming Stellar swap...');
        
        try {
            // Load recipient account
            const recipientAccount = await this.horizonServer.loadAccount(
                recipientKeypair.publicKey()
            );
            
            // Build contract call transaction
            const contract = new StellarSdk.Contract(STELLAR_CONFIG.contractId);
            
            const operation = contract.call(
                'claim_swap',
                StellarSdk.nativeToScVal(swapId, { type: 'string' }),
                StellarSdk.nativeToScVal(Buffer.from(secret, 'hex'), { type: 'bytes' })
            );
            
            const transaction = new StellarSdk.TransactionBuilder(recipientAccount, {
                fee: StellarSdk.BASE_FEE,
                networkPassphrase: STELLAR_CONFIG.passphrase
            })
                .addOperation(operation)
                .setTimeout(30)
                .build();
            
            transaction.sign(recipientKeypair);
            
            const result = await this.stellarServer.sendTransaction(transaction);
            
            if (result.status === 'SUCCESS') {
                console.log('✅ Stellar swap claimed:', result.hash);
                return { success: true, txHash: result.hash };
            } else {
                throw new Error(`Transaction failed: ${result.status}`);
            }
            
        } catch (error) {
            console.error('❌ Failed to claim Stellar swap:', error.message);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Query swap details
     */
    async getSwapDetails(swapId) {
        try {
            const contract = new StellarSdk.Contract(STELLAR_CONFIG.contractId);
            
            const result = await this.stellarServer.simulateTransaction(
                new StellarSdk.TransactionBuilder(
                    new StellarSdk.Account(StellarSdk.Keypair.random().publicKey(), '0'),
                    { fee: StellarSdk.BASE_FEE, networkPassphrase: STELLAR_CONFIG.passphrase }
                )
                    .addOperation(contract.call('get_swap', StellarSdk.nativeToScVal(swapId, { type: 'string' })))
                    .setTimeout(30)
                    .build()
            );
            
            if (result.result) {
                return StellarSdk.scValToNative(result.result.retval);
            }
            
            return null;
        } catch (error) {
            console.error('Failed to get swap details:', error.message);
            return null;
        }
    }
    
    /**
     * Demonstrate a complete cross-chain swap
     */
    async demonstrateSwap() {
        console.log('🚀 Starting Cross-Chain Atomic Swap Demo\n');
        
        // Generate keypairs for demo
        const aliceKeypair = StellarSdk.Keypair.random(); // Alice on Stellar
        const bobKeypair = StellarSdk.Keypair.random();   // Bob on Stellar
        
        console.log('👥 Participants:');
        console.log(`   Alice (Stellar): ${aliceKeypair.publicKey()}`);
        console.log(`   Bob (Stellar): ${bobKeypair.publicKey()}\n`);
        
        // Generate secret for HTLC
        const { secret, hash, hashBytes32 } = this.generateSecret();
        console.log('🔐 HTLC Secret:');
        console.log(`   Secret: ${secret}`);
        console.log(`   Hash: ${hash}\n`);
        
        // Swap parameters
        const swapParams = {
            initiatorKeypair: aliceKeypair,
            recipient: bobKeypair.publicKey(),
            tokenAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQAUJKENIFZB', // USDC on testnet
            amount: 1000000, // 1 USDC (6 decimals)
            hashlock: hash,
            timelock: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
            resolverId: '1inch_fusion_plus'
        };
        
        console.log('📋 Swap Parameters:');
        console.log(`   Token: ${swapParams.tokenAddress}`);
        console.log(`   Amount: ${swapParams.amount / 1000000} USDC`);
        console.log(`   Timelock: ${new Date(swapParams.timelock * 1000).toISOString()}\n`);
        
        // Note: In a real scenario, you would:
        // 1. Create the Stellar swap (as shown above)
        // 2. Create the corresponding Ethereum swap with the same hashlock
        // 3. Bob claims the Ethereum swap revealing the secret
        // 4. Alice uses the revealed secret to claim the Stellar swap
        
        console.log('⚠️  Demo Note: This example shows the Stellar side only.');
        console.log('   For a complete cross-chain swap, you would also need to:');
        console.log('   1. Deploy the Enhanced Ethereum CrossChainHTLC contract');
        console.log('   2. Create corresponding swaps on both chains');
        console.log('   3. Coordinate the claiming process');
        
        return {
            participants: { alice: aliceKeypair.publicKey(), bob: bobKeypair.publicKey() },
            secret: { secret, hash, hashBytes32 },
            swapParams
        };
    }
    
    /**
     * Extract swap ID from transaction result (simplified)
     */
    extractSwapIdFromResult(result) {
        // In a real implementation, you would parse the events or return value
        // to get the actual swap ID. For demo purposes, we use a placeholder.
        return `swap_${Date.now()}`;
    }
}

// Run the demonstration
async function main() {
    if (!STELLAR_CONFIG.contractId) {
        console.error('❌ Please set STELLAR_HTLC_CONTRACT_ID environment variable');
        process.exit(1);
    }
    
    const swap = new CrossChainSwap();
    
    try {
        const demo = await swap.demonstrateSwap();
        console.log('\n✅ Demo completed successfully!');
        console.log('\n🔗 Next Steps:');
        console.log('   1. Fund the demo accounts with testnet tokens');
        console.log('   2. Run the actual swap creation and claiming');
        console.log('   3. Integrate with the Ethereum HTLC contract');
        
    } catch (error) {
        console.error('❌ Demo failed:', error.message);
    }
}

// Only run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { CrossChainSwap };
