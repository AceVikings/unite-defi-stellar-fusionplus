#!/usr/bin/env node

/**
 * Contract Verification and Status Check Script
 * 
 * This script verifies the deployed contract and checks its status
 */

const StellarSdk = require('@stellar/stellar-sdk');
const fs = require('fs');
const path = require('path');

async function verifyContract() {
    const args = process.argv.slice(2);
    const networkArg = args.find(arg => arg.startsWith('--network='));
    const network = networkArg ? networkArg.split('=')[1] : 'testnet';
    
    console.log(`🔍 Verifying Stellar HTLC contract on ${network}...`);
    
    // Load deployment info
    const deploymentFile = path.join(__dirname, `../deployments/${network}.json`);
    if (!fs.existsSync(deploymentFile)) {
        console.error(`❌ Deployment file not found: ${deploymentFile}`);
        process.exit(1);
    }
    
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    console.log(`📋 Contract ID: ${deployment.contractId}`);
    
    // Initialize Stellar SDK
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
    
    const server = new StellarSdk.SorobanRpc.Server(NETWORKS[network].server);
    
    try {
        // Test contract functions
        console.log('🧪 Testing contract functions...');
        
        const contract = new StellarSdk.Contract(deployment.contractId);
        
        // Test get_admin function
        const testKeypair = StellarSdk.Keypair.random();
        const testAccount = new StellarSdk.Account(testKeypair.publicKey(), '0');
        
        const getAdminTx = new StellarSdk.TransactionBuilder(testAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: NETWORKS[network].passphrase
        })
            .addOperation(contract.call('get_admin'))
            .setTimeout(30)
            .build();
        
        const adminResult = await server.simulateTransaction(getAdminTx);
        
        if (adminResult.result) {
            const admin = StellarSdk.scValToNative(adminResult.result.retval);
            console.log(`✅ Admin address: ${admin}`);
        } else {
            console.log('⚠️  Could not retrieve admin address');
        }
        
        // Test get_stats function
        const getStatsTx = new StellarSdk.TransactionBuilder(testAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: NETWORKS[network].passphrase
        })
            .addOperation(contract.call('get_stats'))
            .setTimeout(30)
            .build();
        
        const statsResult = await server.simulateTransaction(getStatsTx);
        
        if (statsResult.result) {
            const stats = StellarSdk.scValToNative(statsResult.result.retval);
            console.log('📊 Contract Stats:');
            console.log(`   Total Swaps: ${stats.total_swaps || 0}`);
            console.log(`   Total Volume: ${stats.total_volume || 0}`);
            console.log(`   Active Swaps: ${stats.active_swaps || 0}`);
        } else {
            console.log('⚠️  Could not retrieve contract stats');
        }
        
        // Check contract code
        console.log('🔍 Checking contract code...');
        const contractData = await server.getContractData(
            deployment.contractId,
            StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance()
        );
        
        if (contractData) {
            console.log('✅ Contract code verified and accessible');
        } else {
            console.log('⚠️  Could not access contract code');
        }
        
        console.log('\n🎉 Contract verification completed!');
        console.log(`🔗 Contract ID: ${deployment.contractId}`);
        console.log(`⏰ Deployed: ${deployment.timestamp}`);
        console.log(`👤 Deployer: ${deployment.deployerAddress}`);
        
        // Generate summary
        const summary = {
            contractId: deployment.contractId,
            network,
            status: 'verified',
            lastChecked: new Date().toISOString(),
            adminAddress: adminResult.result ? StellarSdk.scValToNative(adminResult.result.retval) : 'unknown',
            stats: statsResult.result ? StellarSdk.scValToNative(statsResult.result.retval) : null
        };
        
        const summaryFile = path.join(__dirname, `../deployments/${network}-status.json`);
        fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
        console.log(`📄 Status saved to: ${summaryFile}`);
        
    } catch (error) {
        console.error('❌ Verification failed:', error.message);
        process.exit(1);
    }
}

// Execute verification
verifyContract().catch(console.error);
