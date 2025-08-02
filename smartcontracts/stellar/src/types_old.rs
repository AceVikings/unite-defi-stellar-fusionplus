use soroban_sdk::{contracttype, Address, String, BytesN};

/// Minimum timelock duration (1 hour in seconds)
pub const MIN_TIMELOCK_DURATION: u64 = 3600;

/// Maximum timelock duration (7 days in seconds)
pub const MAX_TIMELOCK_DURATION: u64 = 604800;

/// Minimum resolver collateral
pub const MIN_RESOLVER_COLLATERAL: i128 = 1000000; // 1 million stroops

/// Swap status enumeration
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SwapStatus {
    Pending = 0,
    Active = 1,
    Claimed = 2,
    Refunded = 3,
    Expired = 4,
}

/// HTLC Swap structure
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Swap {
    /// Unique swap identifier
    pub id: BytesN<32>,
    /// Address that locked the funds
    pub sender: Address,
    /// Address that can claim the funds
    pub recipient: Address,
    /// Stellar asset contract address
    pub token: Address,
    /// Amount of tokens locked (after fee deduction)
    pub amount: i128,
    /// SHA-256 hash of the secret
    pub hashlock: BytesN<32>,
    /// UNIX timestamp after which refund is possible
    pub timelock: u64,
    /// Whether funds have been claimed
    pub claimed: bool,
    /// Whether funds have been refunded
    pub refunded: bool,
    /// Secret preimage (revealed after claim)
    pub preimage: BytesN<32>,
    /// Timestamp when swap was created
    pub created_at: u64,
    /// Ethereum transaction hash for cross-chain reference
    pub eth_tx_hash: String,
    /// Optional resolver address for 1inch Fusion+ integration
    pub resolver: Option<Address>,
    /// Protocol fee amount that was deducted
    pub protocol_fee: i128,
    /// Current swap status
    pub status: SwapStatus,
}

/// Resolver information for 1inch Fusion+ integration
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolverInfo {
    /// Collateral amount locked by resolver
    pub collateral: i128,
    /// Whether resolver is currently active
    pub is_active: bool,
    /// Total number of swaps facilitated
    pub total_swaps: u64,
    /// Number of successfully completed swaps
    pub successful_swaps: u64,
    /// Timestamp when resolver was registered
    pub registered_at: u64,
}

/// Contract statistics
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractStats {
    /// Total number of swaps created
    pub total_swaps_created: u64,
    /// Total number of swaps completed successfully
    pub total_swaps_completed: u64,
    /// Total number of swaps refunded
    pub total_swaps_refunded: u64,
    /// Total protocol fees collected
    pub total_fees_collected: i128,
    /// Current protocol fee in basis points
    pub protocol_fee_bps: u32,
}

/// Token interface for Stellar assets
pub mod token {
    use soroban_sdk::{Address, Env, contractclient};
    
    #[contractclient(name = "Client")]
    pub trait Token {
        fn transfer(env: Env, from: Address, to: Address, amount: i128);
        fn balance(env: Env, id: Address) -> i128;
    }
}
