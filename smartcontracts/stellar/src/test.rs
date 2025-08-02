#![cfg(test)]

use super::*;
use soroban_sdk::Env;

#[test]
fn test_basic_compilation() {
    // Basic test to ensure the contract compiles
    let env = Env::default();
    let contract_id = env.register(StellarHTLC, ());
    assert!(!contract_id.to_string().is_empty());
}

#[test]
fn test_error_codes() {
    // Test error code values
    assert_eq!(HTLCError::InvalidAmount as u32, 1000);
    assert_eq!(HTLCError::SwapNotFound as u32, 2000);
    assert_eq!(HTLCError::Unauthorized as u32, 4000);
}