#!/usr/bin/env node

/**
 * Token approval verification script
 * Test which tokens are actually approved in the fresh contract
 */

import { ethers } from 'ethers';

const CONFIG = {
    ethereum: {
        rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
        chainId: 11155111,
        contracts: {
            main: '0x807fCdA7a2D39F5Cf52dC84a05477Bb6857b7f80',
            tokenA: '0xa7b8FE6A5f90D4F3e4bFF447CbAFb3Da3F879d21',
            tokenB: '0xc386B5D64d2aA69106EBC224B7a34127d874ea30',
        },
        privateKey: 'c2e8fca46aec6f2cb8b05e1c466cfb313eb03675468bd95ea6ed01c90f01b11f'
    }
};

const FUSION_PLUS_ABI = [
    "function approvedTokens(address) view returns (bool)",
    "function isTokenApproved(address token) view returns (bool)",
    "function owner() view returns (address)",
    "function setTokenApproval(address token, bool approved) external"
];

async function checkTokenApprovals() {
    try {
        console.log('🔍 Checking token approvals in fresh contract...');
        
        // Connect to provider
        const provider = new ethers.JsonRpcProvider(CONFIG.ethereum.rpcUrl);
        const wallet = new ethers.Wallet(CONFIG.ethereum.privateKey, provider);
        
        // Connect to contract
        const contract = new ethers.Contract(
            CONFIG.ethereum.contracts.main,
            FUSION_PLUS_ABI,
            wallet
        );
        
        console.log('\n📋 Contract Info:');
        console.log(`   Contract: ${CONFIG.ethereum.contracts.main}`);
        console.log(`   Owner: ${await contract.owner()}`);
        console.log(`   Wallet: ${wallet.address}`);
        console.log(`   Is owner: ${(await contract.owner()).toLowerCase() === wallet.address.toLowerCase()}`);
        
        console.log('\n🔍 Token Approval Status:');
        
        // Check ETH (zero address)
        const ethApproved = await contract.approvedTokens(ethers.ZeroAddress);
        console.log(`   ETH (0x0...0): ${ethApproved}`);
        
        // Check Token A
        const tokenAApproved = await contract.approvedTokens(CONFIG.ethereum.contracts.tokenA);
        console.log(`   Token A (${CONFIG.ethereum.contracts.tokenA}): ${tokenAApproved}`);
        
        // Check Token B
        const tokenBApproved = await contract.approvedTokens(CONFIG.ethereum.contracts.tokenB);
        console.log(`   Token B (${CONFIG.ethereum.contracts.tokenB}): ${tokenBApproved}`);
        
        // Try the alternative function if available
        try {
            const ethApproved2 = await contract.isTokenApproved(ethers.ZeroAddress);
            const tokenAApproved2 = await contract.isTokenApproved(CONFIG.ethereum.contracts.tokenA);
            const tokenBApproved2 = await contract.isTokenApproved(CONFIG.ethereum.contracts.tokenB);
            
            console.log('\n🔍 Using isTokenApproved():');
            console.log(`   ETH: ${ethApproved2}`);
            console.log(`   Token A: ${tokenAApproved2}`);
            console.log(`   Token B: ${tokenBApproved2}`);
        } catch (error) {
            console.log('   (isTokenApproved function not available)');
        }
        
        // Check if we need to approve any tokens
        const needsApproval = [];
        if (!ethApproved) needsApproval.push('ETH');
        if (!tokenAApproved) needsApproval.push('Token A');
        if (!tokenBApproved) needsApproval.push('Token B');
        
        if (needsApproval.length > 0) {
            console.log(`\n⚠️  Tokens needing approval: ${needsApproval.join(', ')}`);
            
            // Approve missing tokens
            for (const tokenName of needsApproval) {
                let tokenAddress;
                if (tokenName === 'ETH') tokenAddress = ethers.ZeroAddress;
                else if (tokenName === 'Token A') tokenAddress = CONFIG.ethereum.contracts.tokenA;
                else if (tokenName === 'Token B') tokenAddress = CONFIG.ethereum.contracts.tokenB;
                
                console.log(`\n🔄 Approving ${tokenName} (${tokenAddress})...`);
                try {
                    const tx = await contract.setTokenApproval(tokenAddress, true);
                    await tx.wait();
                    console.log(`   ✅ ${tokenName} approved (TX: ${tx.hash})`);
                } catch (error) {
                    console.log(`   ❌ Failed to approve ${tokenName}: ${error.message}`);
                }
            }
            
            // Re-check status
            console.log('\n🔍 Final Token Approval Status:');
            const ethFinal = await contract.approvedTokens(ethers.ZeroAddress);
            const tokenAFinal = await contract.approvedTokens(CONFIG.ethereum.contracts.tokenA);
            const tokenBFinal = await contract.approvedTokens(CONFIG.ethereum.contracts.tokenB);
            
            console.log(`   ETH: ${ethFinal}`);
            console.log(`   Token A: ${tokenAFinal}`);
            console.log(`   Token B: ${tokenBFinal}`);
            
            if (ethFinal && tokenAFinal && tokenBFinal) {
                console.log('\n✅ All tokens are now approved!');
            } else {
                console.log('\n❌ Some tokens still not approved');
            }
        } else {
            console.log('\n✅ All tokens are already approved!');
        }
        
    } catch (error) {
        console.error('❌ Error checking token approvals:', error.message);
        console.error('Stack:', error.stack);
    }
}

checkTokenApprovals().then(() => {
    console.log('\n🎯 Token approval check completed');
    process.exit(0);
}).catch(error => {
    console.error('💥 Script failed:', error);
    process.exit(1);
});
