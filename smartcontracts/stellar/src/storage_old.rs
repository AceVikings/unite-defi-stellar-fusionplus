use soroban_sdk::{Env, Address, BytesN, contracttype};
use crate::types::{Swap, ResolverInfo};

/// Storage keys for contract data
#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    /// Contract administrator
    Admin,
    /// Fee recipient address
    FeeRecipient,
    /// Protocol fee in basis points
    ProtocolFeeBps,
    /// Swap counter for unique ID generation
    SwapCounter,
    /// Individual swap data
    Swap(BytesN<32>),
    /// Resolver information
    Resolver(Address),
    /// User's swap IDs list
    UserSwaps(Address),
    /// Total swaps created counter
    TotalSwapsCreated,
    /// Total swaps completed counter
    TotalSwapsCompleted,
    /// Total swaps refunded counter
    TotalSwapsRefunded,
    /// Total protocol fees collected
    TotalFeesCollected,
}

// Admin functions
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&StorageKey::Admin, admin);
}

pub fn get_admin(env: &Env) -> Address {
    env.storage().instance().get(&StorageKey::Admin)
        .unwrap_or_else(|| panic!("Admin not set"))
}

// Fee recipient functions
pub fn set_fee_recipient(env: &Env, recipient: &Address) {
    env.storage().instance().set(&StorageKey::FeeRecipient, recipient);
}

pub fn get_fee_recipient(env: &Env) -> Address {
    env.storage().instance().get(&StorageKey::FeeRecipient)
        .unwrap_or_else(|| panic!("Fee recipient not set"))
}

// Protocol fee functions
pub fn set_protocol_fee_bps(env: &Env, fee_bps: u32) {
    env.storage().instance().set(&StorageKey::ProtocolFeeBps, &fee_bps);
}

pub fn get_protocol_fee_bps(env: &Env) -> u32 {
    env.storage().instance().get(&StorageKey::ProtocolFeeBps)
        .unwrap_or(30) // Default 0.3%
}

// Swap counter functions
pub fn set_swap_counter(env: &Env, counter: u64) {
    env.storage().instance().set(&StorageKey::SwapCounter, &counter);
}

pub fn get_swap_counter(env: &Env) -> u64 {
    env.storage().instance().get(&StorageKey::SwapCounter)
        .unwrap_or(0)
}

// Swap functions
pub fn set_swap(env: &Env, swap_id: &BytesN<32>, swap: &Swap) {
    env.storage().persistent().set(&StorageKey::Swap(swap_id.clone()), swap);
}

pub fn get_swap(env: &Env, swap_id: &BytesN<32>) -> Option<Swap> {
    env.storage().persistent().get(&StorageKey::Swap(swap_id.clone()))
}

pub fn has_swap(env: &Env, swap_id: &BytesN<32>) -> bool {
    env.storage().persistent().has(&StorageKey::Swap(swap_id.clone()))
}

// Resolver functions
pub fn set_resolver(env: &Env, resolver: &Address, info: &ResolverInfo) {
    env.storage().persistent().set(&StorageKey::Resolver(resolver.clone()), info);
}

pub fn get_resolver(env: &Env, resolver: &Address) -> Option<ResolverInfo> {
    env.storage().persistent().get(&StorageKey::Resolver(resolver.clone()))
}

pub fn is_resolver_active(env: &Env, resolver: &Address) -> bool {
    if let Some(info) = get_resolver(env, resolver) {
        info.is_active
    } else {
        false
    }
}

pub fn increment_resolver_swaps(env: &Env, resolver: &Address) {
    if let Some(mut info) = get_resolver(env, resolver) {
        info.total_swaps += 1;
        set_resolver(env, resolver, &info);
    }
}

pub fn increment_resolver_successful_swaps(env: &Env, resolver: &Address) {
    if let Some(mut info) = get_resolver(env, resolver) {
        info.successful_swaps += 1;
        set_resolver(env, resolver, &info);
    }
}

// User swaps functions
pub fn add_user_swap(env: &Env, user: &Address, swap_id: &BytesN<32>) {
    let key = StorageKey::UserSwaps(user.clone());
    let mut swaps: soroban_sdk::Vec<BytesN<32>> = env.storage().persistent()
        .get(&key)
        .unwrap_or_else(|| soroban_sdk::Vec::new(env));
    
    swaps.push_back(swap_id.clone());
    env.storage().persistent().set(&key, &swaps);
}

pub fn get_user_swaps(env: &Env, user: &Address) -> soroban_sdk::Vec<BytesN<32>> {
    let key = StorageKey::UserSwaps(user.clone());
    env.storage().persistent()
        .get(&key)
        .unwrap_or_else(|| soroban_sdk::Vec::new(env))
}

// Statistics functions
pub fn set_total_swaps_created(env: &Env, total: u64) {
    env.storage().instance().set(&StorageKey::TotalSwapsCreated, &total);
}

pub fn get_total_swaps_created(env: &Env) -> u64 {
    env.storage().instance().get(&StorageKey::TotalSwapsCreated)
        .unwrap_or(0)
}

pub fn set_total_swaps_completed(env: &Env, total: u64) {
    env.storage().instance().set(&StorageKey::TotalSwapsCompleted, &total);
}

pub fn get_total_swaps_completed(env: &Env) -> u64 {
    env.storage().instance().get(&StorageKey::TotalSwapsCompleted)
        .unwrap_or(0)
}

pub fn set_total_swaps_refunded(env: &Env, total: u64) {
    env.storage().instance().set(&StorageKey::TotalSwapsRefunded, &total);
}

pub fn get_total_swaps_refunded(env: &Env) -> u64 {
    env.storage().instance().get(&StorageKey::TotalSwapsRefunded)
        .unwrap_or(0)
}

pub fn set_total_fees_collected(env: &Env, total: i128) {
    env.storage().instance().set(&StorageKey::TotalFeesCollected, &total);
}

pub fn get_total_fees_collected(env: &Env) -> i128 {
    env.storage().instance().get(&StorageKey::TotalFeesCollected)
        .unwrap_or(0)
}
