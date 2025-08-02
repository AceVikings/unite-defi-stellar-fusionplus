use soroban_sdk::{Env, Address, String, BytesN, symbol_short, contracttype};
use crate::types::SwapStatus;

/// Event structures for cross-chain monitoring compatibility

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractInitializedEvent {
    pub admin: Address,
    pub fee_recipient: Address,
    pub protocol_fee_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SwapInitializedEvent {
    pub swap_id: BytesN<32>,
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    pub amount: i128,
    pub hashlock: BytesN<32>,
    pub timelock: u64,
    pub resolver: Option<Address>,
    pub eth_tx_hash: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FundsClaimedEvent {
    pub swap_id: BytesN<32>,
    pub recipient: Address,
    pub amount: i128,
    pub preimage: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FundsRefundedEvent {
    pub swap_id: BytesN<32>,
    pub sender: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SwapStatusUpdatedEvent {
    pub swap_id: BytesN<32>,
    pub old_status: SwapStatus,
    pub new_status: SwapStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolverRegisteredEvent {
    pub resolver: Address,
    pub collateral: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolverDeactivatedEvent {
    pub resolver: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProtocolFeeUpdatedEvent {
    pub old_fee_bps: u32,
    pub new_fee_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeRecipientUpdatedEvent {
    pub old_recipient: Address,
    pub new_recipient: Address,
}

/// Event emission functions

pub fn emit_contract_initialized(
    env: &Env,
    admin: Address,
    fee_recipient: Address,
    protocol_fee_bps: u32,
) {
    let event = ContractInitializedEvent {
        admin,
        fee_recipient,
        protocol_fee_bps,
    };
    
    env.events().publish(
        (symbol_short!("init"),),
        event
    );
}

pub fn emit_swap_initialized(
    env: &Env,
    swap_id: BytesN<32>,
    sender: Address,
    recipient: Address,
    token: Address,
    amount: i128,
    hashlock: BytesN<32>,
    timelock: u64,
    resolver: Option<Address>,
    eth_tx_hash: String,
) {
    let event = SwapInitializedEvent {
        swap_id: swap_id.clone(),
        sender,
        recipient,
        token,
        amount,
        hashlock,
        timelock,
        resolver,
        eth_tx_hash,
    };
    
    env.events().publish(
        (symbol_short!("swap_init"), swap_id),
        event
    );
}

pub fn emit_funds_claimed(
    env: &Env,
    swap_id: BytesN<32>,
    recipient: Address,
    amount: i128,
    preimage: BytesN<32>,
) {
    let event = FundsClaimedEvent {
        swap_id: swap_id.clone(),
        recipient,
        amount,
        preimage,
    };
    
    env.events().publish(
        (symbol_short!("claimed"), swap_id),
        event
    );
}

pub fn emit_funds_refunded(
    env: &Env,
    swap_id: BytesN<32>,
    sender: Address,
    amount: i128,
) {
    let event = FundsRefundedEvent {
        swap_id: swap_id.clone(),
        sender,
        amount,
    };
    
    env.events().publish(
        (symbol_short!("refunded"), swap_id),
        event
    );
}

pub fn emit_swap_status_updated(
    env: &Env,
    swap_id: BytesN<32>,
    old_status: SwapStatus,
    new_status: SwapStatus,
) {
    let event = SwapStatusUpdatedEvent {
        swap_id: swap_id.clone(),
        old_status,
        new_status,
    };
    
    env.events().publish(
        (symbol_short!("status"), swap_id),
        event
    );
}

pub fn emit_resolver_registered(
    env: &Env,
    resolver: Address,
    collateral: i128,
) {
    let event = ResolverRegisteredEvent {
        resolver: resolver.clone(),
        collateral,
    };
    
    env.events().publish(
        (symbol_short!("res_reg"), resolver),
        event
    );
}

pub fn emit_resolver_deactivated(
    env: &Env,
    resolver: Address,
) {
    let event = ResolverDeactivatedEvent {
        resolver: resolver.clone(),
    };
    
    env.events().publish(
        (symbol_short!("res_deact"), resolver),
        event
    );
}

pub fn emit_protocol_fee_updated(
    env: &Env,
    old_fee_bps: u32,
    new_fee_bps: u32,
) {
    let event = ProtocolFeeUpdatedEvent {
        old_fee_bps,
        new_fee_bps,
    };
    
    env.events().publish(
        (symbol_short!("fee_upd"),),
        event
    );
}

pub fn emit_fee_recipient_updated(
    env: &Env,
    old_recipient: Address,
    new_recipient: Address,
) {
    let event = FeeRecipientUpdatedEvent {
        old_recipient,
        new_recipient,
    };
    
    env.events().publish(
        (symbol_short!("fee_rec"),),
        event
    );
}
