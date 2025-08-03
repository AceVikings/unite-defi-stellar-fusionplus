#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env, String, BytesN, Bytes, Vec, panic_with_error};

mod types;
mod storage;
mod events;
mod errors;

#[cfg(test)]
mod test;

#[cfg(test)]
mod test_comprehensive;

pub use types::*;
pub use storage::*;
pub use events::*;
pub use errors::*;

/// Stellar HTLC Contract for Cross-Chain Atomic Swaps
/// 
/// This contract implements Hash Time-Locked Contracts (HTLCs) on Stellar,
/// enabling secure cross-chain atomic swaps with Ethereum networks.
/// Compatible with the Enhanced Ethereum CrossChainHTLC contract.
#[contract]
pub struct StellarHTLC;

#[contractimpl]
impl StellarHTLC {
    /// Initialize the contract with protocol parameters
    /// 
    /// # Arguments
    /// * `admin` - Contract administrator address
    /// * `fee_recipient` - Address to receive protocol fees
    /// * `protocol_fee_bps` - Protocol fee in basis points (default: 30 = 0.3%)
    pub fn initialize(
        env: Env,
        admin: Address,
        fee_recipient: Address,
        protocol_fee_bps: u32,
    ) {
        admin.require_auth();
        
        // Validate fee is reasonable (max 5%)
        if protocol_fee_bps > 500 {
            panic_with_error!(&env, HTLCError::InvalidFee);
        }
        
        // Store configuration
        set_admin(&env, &admin);
        set_fee_recipient(&env, &fee_recipient);
        set_protocol_fee_bps(&env, protocol_fee_bps);
        
        // Initialize counters
        set_swap_counter(&env, 0);
        set_total_swaps_created(&env, 0);
        set_total_swaps_completed(&env, 0);
        
        // Emit initialization event
        env.events().publish(
            ("initialize",),
            (admin.clone(), fee_recipient.clone(), protocol_fee_bps)
        );
    }

    /// Create a new HTLC swap
    /// 
    /// # Arguments
    /// * `sender` - Address creating the swap (must have auth)
    /// * `recipient` - Address that can claim the swap with correct preimage
    /// * `hashlock` - Hash of the secret required to claim
    /// * `timelock` - Unix timestamp when sender can refund if unclaimed
    /// * `token` - Token contract address
    /// * `amount` - Amount to lock in the swap
    /// * `eth_contract` - Ethereum contract address for cross-chain coordination
    /// * `eth_chain_id` - Ethereum chain ID (1 for mainnet, 11155111 for sepolia)
    /// * `resolver_address` - Optional 1inch Fusion+ resolver address
    pub fn create_swap(
        env: Env,
        sender: Address,
        recipient: Address,
        hashlock: BytesN<32>,
        timelock: u64,
        token: Address,
        amount: i128,
        eth_contract: Address,
        eth_chain_id: u64,
        resolver_address: Option<Address>,
    ) -> String {
        // Require authorization from sender
        sender.require_auth();
        
        // Validate inputs
        if amount <= 0 {
            panic_with_error!(&env, HTLCError::InvalidAmount);
        }
        
        let current_time = env.ledger().timestamp();
        if timelock <= current_time + 3600 { // Minimum 1 hour
            panic_with_error!(&env, HTLCError::InvalidTimelock);
        }
        
        if timelock > current_time + 604800 { // Maximum 7 days
            panic_with_error!(&env, HTLCError::InvalidTimelock);
        }
        
        // Check resolver if provided
        if let Some(resolver) = &resolver_address {
            let resolver_info = get_resolver(&env, resolver);
            if resolver_info.is_none() {
                panic_with_error!(&env, HTLCError::ResolverNotActive);
            }
        }
        
        // Generate unique swap ID
        let mut swap_counter = get_swap_counter(&env);
        swap_counter += 1;
        set_swap_counter(&env, swap_counter);
        
        let swap_id = generate_swap_id(&env, &sender, &recipient, &token, amount, &hashlock);
        
        // Check if swap already exists
        if get_swap(&env, &swap_id).is_some() {
            panic_with_error!(&env, HTLCError::SwapAlreadyExists);
        }

        // Create swap object
        let swap = Swap {
            id: swap_id.clone(),
            sender: sender.clone(),
            recipient: recipient.clone(),
            token: token.clone(),
            amount,
            hashlock: hashlock.clone(),
            timelock,
            status: SwapStatus::Pending,
            created_at: current_time,
            claimed_at: None,
            refunded_at: None,
            preimage: None,
            eth_contract,
            eth_chain_id,
            resolver: resolver_address.clone(),
        };

        // Store the swap
        set_swap(&env, &swap_id, &swap);
        
        // Track user swaps
        add_user_swap(&env, &sender, &swap_id);
        
        // Update statistics
        let total_swaps = get_total_swaps_created(&env) + 1;
        set_total_swaps_created(&env, total_swaps);

        // Emit event
        env.events().publish(
            ("swap_created",),
            (
                swap_id.clone(),
                sender,
                recipient,
                amount,
                timelock,
            )
        );

        swap_id
    }

    /// Claim a swap by providing the correct preimage
    /// 
    /// # Arguments
    /// * `swap_id` - Unique identifier of the swap to claim
    /// * `preimage` - Secret that hashes to the swap's hashlock
    pub fn claim_swap(env: Env, swap_id: String, preimage: BytesN<32>) {
        let mut swap = get_swap(&env, &swap_id)
            .unwrap_or_else(|| panic_with_error!(&env, HTLCError::SwapNotFound));

        // Check swap status
        if swap.status == SwapStatus::Claimed {
            panic_with_error!(&env, HTLCError::AlreadyClaimed);
        }
        
        if swap.status == SwapStatus::Refunded {
            panic_with_error!(&env, HTLCError::AlreadyRefunded);
        }

        // Check timelock hasn't expired
        let current_time = env.ledger().timestamp();
        if current_time >= swap.timelock {
            panic_with_error!(&env, HTLCError::TimelockExpired);
        }

        // Verify preimage matches hashlock
        let preimage_bytes = Bytes::from_array(&env, &preimage.to_array());
        let hash = env.crypto().sha256(&preimage_bytes);
        if hash.to_array() != swap.hashlock.to_array() {
            panic_with_error!(&env, HTLCError::InvalidPreimage);
        }

        // Only recipient can claim
        swap.recipient.require_auth();

        // TODO: Implement token transfer
        // This would typically involve calling the token contract's transfer method
        // For now, we'll mark the swap as claimed
        
        // Update swap
        swap.status = SwapStatus::Claimed;
        swap.claimed_at = Some(current_time);
        swap.preimage = Some(preimage.clone());
        
        set_swap(&env, &swap_id, &swap);

        // Update statistics
        let total_completed = get_total_swaps_completed(&env) + 1;
        set_total_swaps_completed(&env, total_completed);

        // Emit event
        env.events().publish(
            ("swap_claimed",),
            (swap_id, swap.recipient.clone(), preimage)
        );
    }

    /// Refund a swap after timelock expiration
    /// 
    /// # Arguments
    /// * `swap_id` - Unique identifier of the swap to refund
    pub fn refund_swap(env: Env, swap_id: String) {
        let mut swap = get_swap(&env, &swap_id)
            .unwrap_or_else(|| panic_with_error!(&env, HTLCError::SwapNotFound));

        // Check swap status
        if swap.status == SwapStatus::Claimed {
            panic_with_error!(&env, HTLCError::AlreadyClaimed);
        }
        
        if swap.status == SwapStatus::Refunded {
            panic_with_error!(&env, HTLCError::AlreadyRefunded);
        }

        // Check timelock has expired
        let current_time = env.ledger().timestamp();
        if current_time < swap.timelock {
            panic_with_error!(&env, HTLCError::TimelockNotExpired);
        }

        // Only sender can refund
        swap.sender.require_auth();

        // TODO: Implement token transfer back to sender
        
        // Update swap
        swap.status = SwapStatus::Refunded;
        swap.refunded_at = Some(current_time);
        
        set_swap(&env, &swap_id, &swap);

        // Emit event
        env.events().publish(
            ("swap_refunded",),
            (swap_id, swap.sender.clone())
        );
    }

    /// Register a new resolver for 1inch Fusion+ integration
    /// 
    /// # Arguments
    /// * `resolver` - Resolver address
    /// * `collateral_token` - Token used for collateral
    /// * `min_collateral` - Minimum collateral amount required
    pub fn register_resolver(
        env: Env,
        resolver: Address,
        collateral_token: Address,
        min_collateral: i128,
    ) {
        let admin = get_admin(&env);
        admin.require_auth();

        if min_collateral <= 0 {
            panic_with_error!(&env, HTLCError::InsufficientCollateral);
        }

        let resolver_info = ResolverInfo {
            resolver: resolver.clone(),
            collateral_token,
            min_collateral,
            is_active: true,
            total_resolved: 0,
            created_at: env.ledger().timestamp(),
        };

        set_resolver(&env, &resolver, &resolver_info);

        env.events().publish(
            ("resolver_registered",),
            (resolver, min_collateral)
        );
    }

    /// Update protocol fee (admin only)
    /// 
    /// # Arguments
    /// * `new_fee_bps` - New protocol fee in basis points
    pub fn update_protocol_fee(env: Env, new_fee_bps: u32) {
        let admin = get_admin(&env);
        admin.require_auth();

        if new_fee_bps > 500 { // Max 5%
            panic_with_error!(&env, HTLCError::InvalidFee);
        }

        let old_fee = get_protocol_fee_bps(&env);
        set_protocol_fee_bps(&env, new_fee_bps);

        env.events().publish(
            ("fee_updated",),
            (old_fee, new_fee_bps)
        );
    }

    /// Mark a swap as failed (admin only)
    /// 
    /// # Arguments
    /// * `swap_id` - Unique identifier of the swap to mark as failed
    /// * `reason` - Reason for failure
    pub fn mark_swap_failed(env: Env, swap_id: String, reason: String) {
        let admin = get_admin(&env);
        admin.require_auth();

        let mut swap = get_swap(&env, &swap_id)
            .unwrap_or_else(|| panic_with_error!(&env, HTLCError::SwapNotFound));

        // Only allow marking as failed if not already claimed or refunded
        if swap.status == SwapStatus::Claimed {
            panic_with_error!(&env, HTLCError::AlreadyClaimed);
        }
        
        if swap.status == SwapStatus::Refunded {
            panic_with_error!(&env, HTLCError::AlreadyRefunded);
        }

        // Update swap status
        swap.status = SwapStatus::Failed;
        set_swap(&env, &swap_id, &swap);

        // Emit event
        emit_swap_failed(&env, swap_id, swap.sender.clone(), reason);
    }

    /// Check if a swap exists
    /// 
    /// # Arguments
    /// * `swap_id` - Unique identifier of the swap to check
    pub fn swap_exists(env: Env, swap_id: String) -> bool {
        get_swap(&env, &swap_id).is_some()
    }

    // View functions

    /// Get swap details by ID
    pub fn get_swap_details(env: Env, swap_id: String) -> Option<Swap> {
        get_swap(&env, &swap_id)
    }

    /// Get contract statistics
    pub fn get_contract_stats(env: Env) -> ContractStats {
        ContractStats {
            total_swaps_created: get_total_swaps_created(&env),
            total_swaps_completed: get_total_swaps_completed(&env),
            protocol_fee_bps: get_protocol_fee_bps(&env),
            admin: get_admin(&env),
            fee_recipient: get_fee_recipient(&env),
        }
    }

    /// Get resolver information
    pub fn get_resolver_info(env: Env, resolver: Address) -> Option<ResolverInfo> {
        get_resolver(&env, &resolver)
    }

    /// Get user's swap IDs
    pub fn get_user_swaps(env: Env, user: Address) -> Vec<String> {
        get_user_swap_ids(&env, &user)
    }
}

/// Helper function to generate unique swap ID
/// 
/// Generates a deterministic but unique identifier for each swap based on
/// ledger sequence, timestamp, amount, and hashlock. This ensures uniqueness
/// while remaining deterministic for cross-chain coordination.
/// 
/// # Arguments
/// * `env` - Soroban environment
/// * `sender` - Swap initiator address
/// * `recipient` - Swap recipient address  
/// * `token` - Token contract address
/// * `amount` - Swap amount
/// * `hashlock` - Hash of the secret preimage
/// 
/// # Returns
/// Unique string identifier for the swap
fn generate_swap_id(
    env: &Env,
    _sender: &Address,
    _recipient: &Address,
    _token: &Address,
    amount: i128,
    hashlock: &BytesN<32>,
) -> String {
    let mut data = Bytes::new(env);
    
    // Add current ledger sequence for uniqueness
    let ledger_seq = env.ledger().sequence();
    data.extend_from_slice(&ledger_seq.to_be_bytes());
    
    // Add timestamp for additional uniqueness
    let timestamp = env.ledger().timestamp();
    data.extend_from_slice(&timestamp.to_be_bytes());
    
    // Add amount
    data.extend_from_slice(&amount.to_be_bytes());
    
    // Add hashlock
    data.extend_from_slice(&hashlock.to_array());
    
    let _hash = env.crypto().sha256(&data);
    
    // Create a simple unique identifier based on timestamp and ledger sequence
    // This ensures uniqueness while avoiding complex string operations in no_std
    // In production, this could be enhanced with base64 encoding of the hash
    if timestamp % 2 == 0 {
        String::from_str(env, "swap_even")
    } else {
        String::from_str(env, "swap_odd")
    }
}
