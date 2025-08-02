use soroban_sdk::{contracterror};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum HTLCError {
    // Input validation errors
    InvalidAmount = 1000,
    InvalidTimelock = 1001,
    InvalidFee = 1002,
    InvalidPreimage = 1003,
    InvalidRecipient = 1004,
    
    // Swap state errors
    SwapNotFound = 2000,
    SwapAlreadyExists = 2001,
    AlreadyClaimed = 2002,
    AlreadyRefunded = 2003,
    
    // Timing errors
    TimelockExpired = 3000,
    TimelockNotExpired = 3001,
    
    // Authorization errors
    Unauthorized = 4000,
    NotInitiated = 4001,
    
    // External contract errors
    TokenTransferFailed = 5000,
    InsufficientBalance = 5001,
    InsufficientCollateral = 5002,
    
    // Resolver errors
    ResolverNotFound = 6000,
    ResolverNotActive = 6001,
    
    // Contract state errors
    AlreadyInitialized = 7000,
    NotInitialized = 7001,
}

