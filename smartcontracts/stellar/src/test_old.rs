#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env, Address, String, BytesN};

#[test]
fn test_basic_compilation() {
    // Basic test to ensure the contract compiles
    let env = Env::default();
    let contract_id = env.register_contract(None, StellarHTLC);
    assert!(!contract_id.to_string().is_empty());
}

#[test]
fn test_error_codes() {
    // Test error code values
    assert_eq!(HTLCError::InvalidAmount.code(), 1001);
    assert_eq!(HTLCError::SwapNotFound.code(), 2001);
    assert_eq!(HTLCError::Unauthorized.code(), 3001);
}

#[test]
fn test_swap_status_values() {
    // Test swap status enum values
    assert_eq!(SwapStatus::Pending as u32, 0);
    assert_eq!(SwapStatus::Active as u32, 1);
    assert_eq!(SwapStatus::Claimed as u32, 2);
    assert_eq!(SwapStatus::Refunded as u32, 3);
}

#[test]
fn test_constants() {
    // Test defined constants
    assert_eq!(MIN_TIMELOCK_DURATION, 3600);
    assert_eq!(MAX_TIMELOCK_DURATION, 604800);
    assert_eq!(MIN_RESOLVER_COLLATERAL, 1000000);
}
