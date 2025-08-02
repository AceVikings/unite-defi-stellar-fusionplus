use soroban_sdk::{contracttype, Address, String, BytesN};

/// Minimum timelock duration (1 hour in seconds)
pub const MIN_TIMELOCK_DURATION: u64 = 3600;

/// Maximum timelock duration (7 days in seconds) 
pub const MAX_TIMELOCK_DURATION: u64 = 604800;

/// Maximum protocol fee (5% in basis points)
pub const MAX_PROTOCOL_FEE_BPS: u32 = 500;

/// Swap status enumeration
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SwapStatus {
    Pending,
    Active, 
    Claimed,
    Refunded,
}

/// HTLC Swap structure
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Swap {
    /// Unique swap identifier
    pub id: String,
    /// Address that locked the funds
    pub sender: Address,
    /// Address that can claim the funds
    pub recipient: Address,
    /// Stellar asset contract address
    pub token: Address,
    /// Amount of tokens locked
    pub amount: i128,
    /// SHA-256 hash of the secret
    pub hashlock: BytesN<32>,
    /// UNIX timestamp after which refund is possible
    pub timelock: u64,
    /// Current status of the swap
    pub status: SwapStatus,
    /// Timestamp when swap was created
    pub created_at: u64,
    /// Timestamp when swap was claimed (if applicable)
    pub claimed_at: Option<u64>,
    /// Timestamp when swap was refunded (if applicable) 
    pub refunded_at: Option<u64>,
    /// Secret preimage (revealed after claim)
    pub preimage: Option<BytesN<32>>,
    /// Ethereum contract address for cross-chain coordination
    pub eth_contract: Address,
    /// Ethereum chain ID
    pub eth_chain_id: u64,
    /// Optional resolver address for 1inch Fusion+ integration
    pub resolver: Option<Address>,
}

/// Resolver information for 1inch Fusion+ integration
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolverInfo {
    /// Resolver address
    pub resolver: Address,
    /// Token used for collateral
    pub collateral_token: Address,
    /// Minimum collateral amount
    pub min_collateral: i128,
    /// Whether resolver is active
    pub is_active: bool,
    /// Total number of swaps resolved
    pub total_resolved: u64,
    /// Timestamp when resolver was registered
    pub created_at: u64,
}

/// Contract statistics structure
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractStats {
    /// Total number of swaps created
    pub total_swaps_created: u64,
    /// Total number of swaps completed
    pub total_swaps_completed: u64,
    /// Current protocol fee in basis points
    pub protocol_fee_bps: u32,
    /// Contract administrator
    pub admin: Address,
    /// Protocol fee recipient
    pub fee_recipient: Address,
}