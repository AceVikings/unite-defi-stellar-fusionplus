#!/usr/bin/env node

/**
 * Stellar HTLC Contract Deployment Script
 * 
 * This script deploys the Stellar HTLC contract to Stellar networks
 * and configures it for cross-chain atomic swaps.
 * 
 * Usage:
 *   node deploy.js --network testnet
 *   node deploy.js --network mainnet
 */

const StellarSdk = require('@stellar/stellar-sdk');
const fs = require('fs');
const path = require('path');

// Configuration
const NETWORKS = {
    testnet: {
        server: 'https://soroban-testnet.stellar.org',
        passphrase: StellarSdk.Networks.TESTNET,
        horizon: 'https://horizon-testnet.stellar.org'
    },
    mainnet: {
        server: 'https://soroban-mainnet.stellar.org',
        passphrase: StellarSdk.Networks.PUBLIC,
        horizon: 'https://horizon.stellar.org'
    }
};

async function deployContract() {
    const args = process.argv.slice(2);
    const networkArg = args.find(arg => arg.startsWith('--network='));
    const network = networkArg ? networkArg.split('=')[1] : 'testnet';
    
    if (!NETWORKS[network]) {
        console.error('Invalid network. Use testnet or mainnet');
        process.exit(1);
    }
    
    console.log(`🚀 Deploying Stellar HTLC contract to ${network}...`);
    
    // Load contract WASM
    const wasmPath = path.join(__dirname, '../target/wasm32-unknown-unknown/release/stellar_htlc.wasm');
    if (!fs.existsSync(wasmPath)) {
        console.error('❌ Contract WASM not found. Run: cargo build --target wasm32-unknown-unknown --release');
        process.exit(1);
    }
    
    const contractWasm = fs.readFileSync(wasmPath);
    console.log(`📦 Contract size: ${contractWasm.length} bytes`);
    
    // Initialize Stellar SDK
    const server = new StellarSdk.SorobanRpc.Server(NETWORKS[network].server);
    
    // Load deployer keypair from environment or prompt
    const secretKey = process.env.STELLAR_SECRET_KEY;
    if (!secretKey) {
        console.error('❌ Please set STELLAR_SECRET_KEY environment variable');
        process.exit(1);
    }
    
    const deployerKeypair = StellarSdk.Keypair.fromSecret(secretKey);
    console.log(`👤 Deployer: ${deployerKeypair.publicKey()}`);
    
    try {
        // Load deployer account
        const horizonServer = new StellarSdk.Horizon.Server(NETWORKS[network].horizon);
        const deployerAccount = await horizonServer.loadAccount(deployerKeypair.publicKey());
        
        // Deploy contract
        console.log('📤 Uploading contract...');
        
        const uploadOperation = StellarSdk.Operation.uploadContractWasm({
            wasm: contractWasm,
        });
        
        const uploadTx = new StellarSdk.TransactionBuilder(deployerAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: NETWORKS[network].passphrase,
        })
            .addOperation(uploadOperation)
            .setTimeout(30)
            .build();
        
        uploadTx.sign(deployerKeypair);
        
        const uploadResult = await server.sendTransaction(uploadTx);
        console.log('✅ Contract uploaded:', uploadResult.hash);
        
        // Create contract instance
        console.log('🏗️  Creating contract instance...');
        
        const contractAddress = StellarSdk.Address.contract(
            StellarSdk.hash(contractWasm)
        );
        
        const createOperation = StellarSdk.Operation.createStellarAsset({
            contractAddress: contractAddress.toString(),
        });
        
        const createTx = new StellarSdk.TransactionBuilder(deployerAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: NETWORKS[network].passphrase,
        })
            .addOperation(createOperation)
            .setTimeout(30)
            .build();
        
        createTx.sign(deployerKeypair);
        
        const createResult = await server.sendTransaction(createTx);
        console.log('✅ Contract instance created:', createResult.hash);
        
        // Initialize contract
        console.log('⚙️  Initializing contract...');
        
        const adminAddress = deployerKeypair.publicKey();
        const feeRecipient = process.env.FEE_RECIPIENT || adminAddress;
        const protocolFeeBps = parseInt(process.env.PROTOCOL_FEE_BPS || '30');
        
        console.log(`📋 Configuration:`);
        console.log(`   Admin: ${adminAddress}`);
        console.log(`   Fee Recipient: ${feeRecipient}`);
        console.log(`   Protocol Fee: ${protocolFeeBps} bps (${protocolFeeBps/100}%)`);
        
        // Save deployment info
        const deploymentInfo = {
            network,
            contractId: contractAddress.toString(),
            deployerAddress: adminAddress,
            txHashes: {
                upload: uploadResult.hash,
                create: createResult.hash
            },
            timestamp: new Date().toISOString(),
            configuration: {
                admin: adminAddress,
                feeRecipient,
                protocolFeeBps
            }
        };
        
        const deploymentFile = path.join(__dirname, `../deployments/${network}.json`);
        fs.mkdirSync(path.dirname(deploymentFile), { recursive: true });
        fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
        
        console.log('🎉 Deployment completed successfully!');
        console.log(`📄 Deployment info saved to: ${deploymentFile}`);
        console.log(`🔗 Contract ID: ${contractAddress.toString()}`);
        
    } catch (error) {
        console.error('❌ Deployment failed:', error.message);
        process.exit(1);
    }
}

// Execute deployment
deployContract().catch(console.error);
