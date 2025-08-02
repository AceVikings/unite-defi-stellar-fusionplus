use soroban_sdk::{Env, Address, String, contracttype, Vec};
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
    Swap(String),
    /// Resolver information
    Resolver(Address),
    /// User's swap IDs list
    UserSwaps(Address),
    /// Total swaps created counter
    TotalSwapsCreated,
    /// Total swaps completed counter
    TotalSwapsCompleted,
}

// Configuration functions
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&StorageKey::Admin, admin);
}

pub fn get_admin(env: &Env) -> Address {
    env.storage().instance().get(&StorageKey::Admin)
        .unwrap_or_else(|| panic!("Admin not set"))
}

pub fn set_fee_recipient(env: &Env, recipient: &Address) {
    env.storage().instance().set(&StorageKey::FeeRecipient, recipient);
}

pub fn get_fee_recipient(env: &Env) -> Address {
    env.storage().instance().get(&StorageKey::FeeRecipient)
        .unwrap_or_else(|| panic!("Fee recipient not set"))
}

pub fn set_protocol_fee_bps(env: &Env, fee_bps: u32) {
    env.storage().instance().set(&StorageKey::ProtocolFeeBps, &fee_bps);
}

pub fn get_protocol_fee_bps(env: &Env) -> u32 {
    env.storage().instance().get(&StorageKey::ProtocolFeeBps)
        .unwrap_or(30) // Default 0.3%
}

// Counter functions
pub fn set_swap_counter(env: &Env, counter: u64) {
    env.storage().instance().set(&StorageKey::SwapCounter, &counter);
}

pub fn get_swap_counter(env: &Env) -> u64 {
    env.storage().instance().get(&StorageKey::SwapCounter)
        .unwrap_or(0)
}

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

// Swap functions
pub fn set_swap(env: &Env, swap_id: &String, swap: &Swap) {
    env.storage().persistent().set(&StorageKey::Swap(swap_id.clone()), swap);
}

pub fn get_swap(env: &Env, swap_id: &String) -> Option<Swap> {
    env.storage().persistent().get(&StorageKey::Swap(swap_id.clone()))
}

// Resolver functions
pub fn set_resolver(env: &Env, resolver: &Address, info: &ResolverInfo) {
    env.storage().persistent().set(&StorageKey::Resolver(resolver.clone()), info);
}

pub fn get_resolver(env: &Env, resolver: &Address) -> Option<ResolverInfo> {
    env.storage().persistent().get(&StorageKey::Resolver(resolver.clone()))
}

// User swap tracking
pub fn add_user_swap(env: &Env, user: &Address, swap_id: &String) {
    let key = StorageKey::UserSwaps(user.clone());
    let mut swaps: Vec<String> = env.storage().persistent().get(&key).unwrap_or(Vec::new(env));
    swaps.push_back(swap_id.clone());
    env.storage().persistent().set(&key, &swaps);
}

pub fn get_user_swap_ids(env: &Env, user: &Address) -> Vec<String> {
    let key = StorageKey::UserSwaps(user.clone());
    env.storage().persistent().get(&key).unwrap_or(Vec::new(env))
}
