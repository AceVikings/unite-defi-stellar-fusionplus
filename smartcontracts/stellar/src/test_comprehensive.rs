#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::{Address as _, Ledger}, Env, Address, BytesN};

fn create_test_env() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    
    let admin = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    (env, admin, fee_recipient, token)
}

#[test]
fn test_contract_initialization() {
    let (env, admin, fee_recipient, _) = create_test_env();
    let contract_id = env.register(StellarHTLC, ());
    let client = StellarHTLCClient::new(&env, &contract_id);
    
    // Initialize contract
    client.initialize(&admin, &fee_recipient, &30);
    
    // Verify initialization
    let stats = client.get_contract_stats();
    assert_eq!(stats.admin, admin);
    assert_eq!(stats.fee_recipient, fee_recipient);
    assert_eq!(stats.protocol_fee_bps, 30);
    assert_eq!(stats.total_swaps_created, 0);
    assert_eq!(stats.total_swaps_completed, 0);
}

#[test]
fn test_create_swap() {
    let (env, admin, fee_recipient, token) = create_test_env();
    let contract_id = env.register(StellarHTLC, ());
    let client = StellarHTLCClient::new(&env, &contract_id);
    
    // Initialize contract
    client.initialize(&admin, &fee_recipient, &30);
    
    // Create test data - note: in Soroban test env timestamp starts at 0
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let eth_contract = Address::generate(&env);
    let hashlock = BytesN::from_array(&env, &[1u8; 32]);
    let timelock = 7200u64; // 2 hours from epoch (well above minimum)
    let amount = 1_000_000i128;
    
    // Create swap
    let swap_id = client.create_swap(
        &sender,
        &recipient,
        &hashlock,
        &timelock,
        &token,
        &amount,
        &eth_contract,
        &11155111u64, // Sepolia chain ID
        &None,
    );
    
    // Verify swap was created
    assert!(!swap_id.is_empty());
    
    let swap = client.get_swap_details(&swap_id).unwrap();
    assert_eq!(swap.sender, sender);
    assert_eq!(swap.recipient, recipient);
    assert_eq!(swap.amount, amount);
    assert_eq!(swap.hashlock, hashlock);
    assert_eq!(swap.timelock, timelock);
    assert_eq!(swap.status, SwapStatus::Pending);
    
    // Check stats
    let stats = client.get_contract_stats();
    assert_eq!(stats.total_swaps_created, 1);
    assert_eq!(stats.total_swaps_completed, 0);
}

#[test] 
fn test_claim_swap() {
    let (env, admin, fee_recipient, token) = create_test_env();
    let contract_id = env.register(StellarHTLC, ());
    let client = StellarHTLCClient::new(&env, &contract_id);
    
    // Initialize contract
    client.initialize(&admin, &fee_recipient, &30);
    
    // Create test data
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let eth_contract = Address::generate(&env);
    
    // Create a preimage and its hash
    let preimage = BytesN::from_array(&env, &[42u8; 32]);
    let preimage_bytes = Bytes::from_array(&env, &preimage.to_array());
    let hashlock = env.crypto().sha256(&preimage_bytes).into();
    
    let timelock = 7200u64; // 2 hours
    let amount = 1_000_000i128;
    
    // Create swap
    let swap_id = client.create_swap(
        &sender,
        &recipient,
        &hashlock,
        &timelock,
        &token,
        &amount,
        &eth_contract,
        &11155111u64,
        &None,
    );
    
    // Claim swap with correct preimage
    client.claim_swap(&swap_id, &preimage);
    
    // Verify claim
    let swap = client.get_swap_details(&swap_id).unwrap();
    assert_eq!(swap.status, SwapStatus::Claimed);
    assert_eq!(swap.preimage.unwrap(), preimage);
    assert!(swap.claimed_at.is_some());
    
    // Check stats
    let stats = client.get_contract_stats();
    assert_eq!(stats.total_swaps_completed, 1);
}

#[test]
fn test_refund_swap() {
    let (env, admin, fee_recipient, token) = create_test_env();
    let contract_id = env.register(StellarHTLC, ());
    let client = StellarHTLCClient::new(&env, &contract_id);
    
    // Initialize contract
    client.initialize(&admin, &fee_recipient, &30);
    
    // Create test data
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let eth_contract = Address::generate(&env);
    let hashlock = BytesN::from_array(&env, &[1u8; 32]);
    let timelock = 7200u64; // 2 hours
    let amount = 1_000_000i128;
    
    // Create swap
    let swap_id = client.create_swap(
        &sender,
        &recipient,
        &hashlock,
        &timelock,
        &token,
        &amount,
        &eth_contract,
        &11155111u64,
        &None,
    );
    
    // Fast forward past timelock
    env.ledger().with_mut(|li| {
        li.timestamp = timelock + 1;
    });
    
    // Refund swap
    client.refund_swap(&swap_id);
    
    // Verify refund
    let swap = client.get_swap_details(&swap_id).unwrap();
    assert_eq!(swap.status, SwapStatus::Refunded);
    assert!(swap.refunded_at.is_some());
}

#[test]
fn test_register_resolver() {
    let (env, admin, fee_recipient, _) = create_test_env();
    let contract_id = env.register(StellarHTLC, ());
    let client = StellarHTLCClient::new(&env, &contract_id);
    
    // Initialize contract
    client.initialize(&admin, &fee_recipient, &30);
    
    // Register resolver
    let resolver = Address::generate(&env);
    let collateral_token = Address::generate(&env);
    let min_collateral = 5_000_000i128;
    
    client.register_resolver(&resolver, &collateral_token, &min_collateral);
    
    // Verify resolver
    let resolver_info = client.get_resolver_info(&resolver).unwrap();
    assert_eq!(resolver_info.resolver, resolver);
    assert_eq!(resolver_info.collateral_token, collateral_token);
    assert_eq!(resolver_info.min_collateral, min_collateral);
    assert!(resolver_info.is_active);
}
