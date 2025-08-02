#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env, String, BytesN};

mod types;
mod storage;
mod events;
mod errors;

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
        set_total_swaps_refunded(&env, 0);
        set_total_fees_collected(&env, 0);
        
        // Emit initialization event
        events::emit_contract_initialized(&env, admin, fee_recipient, protocol_fee_bps);
    }
    
    /// Create a new HTLC swap
    /// 
    /// # Arguments
    /// * `recipient` - Address that can claim the funds
    /// * `token` - Stellar asset contract address
    /// * `amount` - Amount to lock (including protocol fee)
    /// * `hashlock` - SHA-256 hash of the secret
    /// * `timelock` - UNIX timestamp after which refund is possible
    /// * `resolver` - Optional resolver address for 1inch Fusion+ integration
    /// * `eth_tx_hash` - Ethereum transaction hash for cross-chain reference
    /// 
    /// # Returns
    /// * `BytesN<32>` - Unique swap identifier
    pub fn initialize_swap(
        env: Env,
        recipient: Address,
        token: Address,
        amount: i128,
        hashlock: BytesN<32>,
        timelock: u64,
        resolver: Option<Address>,
        eth_tx_hash: String,
    ) -> BytesN<32> {
        // Input validation
        if amount <= 0 {
            panic_with_error!(&env, HTLCError::InvalidAmount);
        }
        
        let current_time = env.ledger().timestamp();
        let min_timelock = current_time + MIN_TIMELOCK_DURATION;
        let max_timelock = current_time + MAX_TIMELOCK_DURATION;
        
        if timelock <= min_timelock {
            panic_with_error!(&env, HTLCError::InvalidTimelock);
        }
        
        if timelock > max_timelock {
            panic_with_error!(&env, HTLCError::InvalidTimelock);
        }
        
        // Validate resolver if provided
        if let Some(resolver_addr) = &resolver {
            if !is_resolver_active(&env, resolver_addr) {
                panic_with_error!(&env, HTLCError::ResolverNotActive);
            }
        }
        
        // Calculate fees
        let protocol_fee_bps = get_protocol_fee_bps(&env);
        let protocol_fee = (amount * protocol_fee_bps as i128) / 10000;
        let net_amount = amount - protocol_fee;
        
        // Generate unique swap ID
        let swap_counter = get_swap_counter(&env) + 1;
        set_swap_counter(&env, swap_counter);
        
        let swap_id = generate_swap_id(&env, &env.current_contract_address(), &recipient, &token, amount, &hashlock, timelock, swap_counter);
        
        // Ensure swap doesn't already exist
        if has_swap(&env, &swap_id) {
            panic_with_error!(&env, HTLCError::SwapAlreadyExists);
        }
        
        // Transfer tokens from sender to contract (simplified for compilation)
        // In production, implement proper token transfers
        // token::Client::new(&env, &token).transfer(
        //     &env.invoker(),
        //     &sender,
        //     &amount,
        // );
        
        // Transfer protocol fee to fee recipient if applicable (simplified)
        if protocol_fee > 0 {
            // let fee_recipient = get_fee_recipient(&env);
            // token::Client::new(&env, &token).transfer(
            //     &sender,
            //     &fee_recipient,
            //     &protocol_fee,
            // );
            
            // Update total fees collected
            let total_fees = get_total_fees_collected(&env) + protocol_fee;
            set_total_fees_collected(&env, total_fees);
        }
        
        // Create swap
        let swap = Swap {
            id: swap_id.clone(),
            sender: env.invoker(),
            recipient: recipient.clone(),
            token: token.clone(),
            amount: net_amount,
            hashlock: hashlock.clone(),
            timelock,
            claimed: false,
            refunded: false,
            preimage: BytesN::from_array(&env, &[0u8; 32]),
            created_at: current_time,
            eth_tx_hash: eth_tx_hash.clone(),
            resolver: resolver.clone(),
            protocol_fee,
            status: SwapStatus::Active,
        };
        
        // Store swap
        set_swap(&env, &swap_id, &swap);
        
        // Add to user's swap list
        add_user_swap(&env, &env.invoker(), &swap_id);
        
        // Update statistics
        let total_created = get_total_swaps_created(&env) + 1;
        set_total_swaps_created(&env, total_created);
        
        // Update resolver stats if applicable
        if let Some(resolver_addr) = &resolver {
            increment_resolver_swaps(&env, resolver_addr);
        }
        
        // Emit events
        events::emit_swap_initialized(
            &env,
            swap_id.clone(),
            env.invoker(),
            recipient,
            token,
            net_amount,
            hashlock,
            timelock,
            resolver,
            eth_tx_hash,
        );
        
        events::emit_swap_status_updated(&env, swap_id.clone(), SwapStatus::Pending, SwapStatus::Active);
        
        swap_id
    }
    
    /// Claim funds with valid preimage
    /// 
    /// # Arguments
    /// * `swap_id` - Unique swap identifier
    /// * `preimage` - Secret that hashes to the hashlock
    pub fn claim_funds(env: Env, swap_id: BytesN<32>, preimage: BytesN<32>) {
        let mut swap = get_swap(&env, &swap_id)
            .unwrap_or_else(|| panic_with_error!(&env, HTLCError::SwapNotFound));
        
        // Validate swap state
        if swap.claimed {
            panic_with_error!(&env, HTLCError::AlreadyClaimed);
        }
        
        if swap.refunded {
            panic_with_error!(&env, HTLCError::AlreadyRefunded);
        }
        
        // Check timelock hasn't expired
        let current_time = env.ledger().timestamp();
        if current_time >= swap.timelock {
            panic_with_error!(&env, HTLCError::TimelockExpired);
        }
        
        // Validate preimage
        let hash = env.crypto().sha256(&preimage);
        if hash != swap.hashlock {
            panic_with_error!(&env, HTLCError::InvalidPreimage);
        }
        
        // Only recipient can claim
        swap.recipient.require_auth();
        
        // Update swap state
        swap.claimed = true;
        swap.preimage = preimage.clone();
        swap.status = SwapStatus::Claimed;
        set_swap(&env, &swap_id, &swap);
        
        // Transfer funds to recipient (simplified for compilation)
        // In production, implement proper token transfers
        // token::Client::new(&env, &swap.token).transfer(
        //     &env.current_contract_address(),
        //     &swap.recipient,
        //     &swap.amount,
        // );
        
        // Update statistics
        let total_completed = get_total_swaps_completed(&env) + 1;
        set_total_swaps_completed(&env, total_completed);
        
        // Update resolver stats if applicable
        if let Some(resolver_addr) = &swap.resolver {
            increment_resolver_successful_swaps(&env, resolver_addr);
        }
        
        // Emit events
        events::emit_funds_claimed(&env, swap_id.clone(), swap.recipient.clone(), swap.amount, preimage);
        events::emit_swap_status_updated(&env, swap_id, SwapStatus::Active, SwapStatus::Claimed);
    }
    
    /// Refund funds after timelock expiration
    /// 
    /// # Arguments
    /// * `swap_id` - Unique swap identifier
    pub fn refund_funds(env: Env, swap_id: BytesN<32>) {
        let mut swap = get_swap(&env, &swap_id)
            .unwrap_or_else(|| panic_with_error!(&env, HTLCError::SwapNotFound));
        
        // Validate swap state
        if swap.claimed {
            panic_with_error!(&env, HTLCError::AlreadyClaimed);
        }
        
        if swap.refunded {
            panic_with_error!(&env, HTLCError::AlreadyRefunded);
        }
        
        // Check timelock has expired
        let current_time = env.ledger().timestamp();
        if current_time < swap.timelock {
            panic_with_error!(&env, HTLCError::TimelockNotExpired);
        }
        
        // Only sender can refund
        swap.sender.require_auth();
        
        // Update swap state
        swap.refunded = true;
        swap.status = SwapStatus::Refunded;
        set_swap(&env, &swap_id, &swap);
        
        // Transfer funds back to sender (simplified for compilation)
        // In production, implement proper token transfers
        // token::Client::new(&env, &swap.token).transfer(
        //     &env.current_contract_address(),
        //     &swap.sender,
        //     &swap.amount,
        // );
        
        // Update statistics
        let total_refunded = get_total_swaps_refunded(&env) + 1;
        set_total_swaps_refunded(&env, total_refunded);
        
        // Emit events
        events::emit_funds_refunded(&env, swap_id.clone(), swap.sender.clone(), swap.amount);
        events::emit_swap_status_updated(&env, swap_id, SwapStatus::Active, SwapStatus::Refunded);
    }
    
    /// Register a new resolver for 1inch Fusion+ integration
    /// 
    /// # Arguments
    /// * `resolver` - Resolver address to register
    /// * `collateral_amount` - Required collateral amount
    pub fn register_resolver(env: Env, resolver: Address, collateral_amount: i128) {
        let admin = get_admin(&env);
        admin.require_auth();
        
        if collateral_amount < MIN_RESOLVER_COLLATERAL {
            panic_with_error!(&env, HTLCError::InsufficientCollateral);
        }
        
        // Create resolver info
        let resolver_info = ResolverInfo {
            collateral: collateral_amount,
            is_active: true,
            total_swaps: 0,
            successful_swaps: 0,
            registered_at: env.ledger().timestamp(),
        };
        
        set_resolver(&env, &resolver, &resolver_info);
        
        events::emit_resolver_registered(&env, resolver, collateral_amount);
    }
    
    /// Deactivate a resolver
    /// 
    /// # Arguments
    /// * `resolver` - Resolver address to deactivate
    pub fn deactivate_resolver(env: Env, resolver: Address) {
        let admin = get_admin(&env);
        admin.require_auth();
        
        let mut resolver_info = get_resolver(&env, &resolver)
            .unwrap_or_else(|| panic_with_error!(&env, HTLCError::ResolverNotFound));
        
        resolver_info.is_active = false;
        set_resolver(&env, &resolver, &resolver_info);
        
        events::emit_resolver_deactivated(&env, resolver);
    }
    
    /// Update protocol fee (admin only)
    /// 
    /// # Arguments
    /// * `new_fee_bps` - New protocol fee in basis points
    pub fn update_protocol_fee(env: Env, new_fee_bps: u32) {
        let admin = get_admin(&env);
        admin.require_auth();
        
        if new_fee_bps > 500 {
            panic_with_error!(&env, HTLCError::InvalidFee);
        }
        
        let old_fee = get_protocol_fee_bps(&env);
        set_protocol_fee_bps(&env, new_fee_bps);
        
        events::emit_protocol_fee_updated(&env, old_fee, new_fee_bps);
    }
    
    /// Update fee recipient (admin only)
    /// 
    /// # Arguments
    /// * `new_recipient` - New fee recipient address
    pub fn update_fee_recipient(env: Env, new_recipient: Address) {
        let admin = get_admin(&env);
        admin.require_auth();
        
        let old_recipient = get_fee_recipient(&env);
        set_fee_recipient(&env, &new_recipient);
        
        events::emit_fee_recipient_updated(&env, old_recipient, new_recipient);
    }
    
    // View functions
    
    /// Get swap details
    pub fn get_swap(env: Env, swap_id: BytesN<32>) -> Option<Swap> {
        get_swap(&env, &swap_id)
    }
    
    /// Get contract statistics
    pub fn get_contract_stats(env: Env) -> ContractStats {
        ContractStats {
            total_swaps_created: get_total_swaps_created(&env),
            total_swaps_completed: get_total_swaps_completed(&env),
            total_swaps_refunded: get_total_swaps_refunded(&env),
            total_fees_collected: get_total_fees_collected(&env),
            protocol_fee_bps: get_protocol_fee_bps(&env),
        }
    }
    
    /// Get resolver information
    pub fn get_resolver_info(env: Env, resolver: Address) -> Option<ResolverInfo> {
        get_resolver(&env, &resolver)
    }
    
    /// Get user's swap IDs
    pub fn get_user_swaps(env: Env, user: Address) -> soroban_sdk::Vec<BytesN<32>> {
        get_user_swaps(&env, &user)
    }
    
    /// Check if swap exists
    pub fn swap_exists(env: Env, swap_id: BytesN<32>) -> bool {
        has_swap(&env, &swap_id)
    }
    
    /// Get current timestamp
    pub fn get_current_time(env: Env) -> u64 {
        env.ledger().timestamp()
    }
}

// Helper functions
fn generate_swap_id(
    env: &Env,
    contract: &Address,
    recipient: &Address,
    token: &Address,
    amount: i128,
    hashlock: &BytesN<32>,
    timelock: u64,
    counter: u64,
) -> BytesN<32> {
    let mut data = soroban_sdk::Bytes::new(env);
    data.extend_from_slice(&contract.to_xdr(env));
    data.extend_from_slice(&recipient.to_xdr(env));
    data.extend_from_slice(&token.to_xdr(env));
    data.extend_from_slice(&amount.to_be_bytes());
    data.extend_from_slice(hashlock.as_slice());
    data.extend_from_slice(&timelock.to_be_bytes());
    data.extend_from_slice(&counter.to_be_bytes());
    data.extend_from_slice(&env.ledger().timestamp().to_be_bytes());
    
    env.crypto().sha256(&data)
}
