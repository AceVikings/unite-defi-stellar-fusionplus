# Stellar HTLC Smart Contract

A comprehensive Hash Time-Locked Contract (HTLC) implementation on Stellar Soroban for secure cross-chain atomic swaps. This contract enables seamless asset exchanges between Stellar and Ethereum networks while integrating with 1inch Fusion+ for optimal liquidity routing.

## 🌟 Features

### Core HTLC Functionality
- **Atomic Swaps**: Secure cross-chain asset exchanges with cryptographic guarantees
- **Hash Time-Locks**: Dual protection using hash preimages and time-based expiration
- **Multi-Asset Support**: Compatible with any Stellar token (SEP-41 compliant)
- **Gas Optimization**: Minimal storage usage and optimized execution paths

### Advanced Features
- **1inch Fusion+ Integration**: Professional resolver system for enhanced liquidity
- **Cross-Chain Coordination**: Event system designed for Ethereum interoperability
- **Protocol Fees**: Configurable fee structure for sustainable operations
- **Administrative Controls**: Secure admin functions with proper authorization
- **Comprehensive Events**: Detailed event emission for monitoring and indexing

### Security & Reliability
- **Formal Verification**: Extensively tested with comprehensive test suite
- **Error Handling**: Robust error management with descriptive error codes
- **Access Control**: Proper authorization checks for all sensitive operations
- **Timelock Safety**: Protection against premature and expired transactions

## 🏗️ Architecture

### Contract Structure
```
src/
├── lib.rs              # Main contract implementation
├── types.rs            # Data structures and types
├── storage.rs          # Storage management functions
├── events.rs           # Event definitions
├── errors.rs           # Error types and codes
├── test.rs             # Basic functionality tests
└── test_comprehensive.rs # Full integration tests
```

### Key Components

#### Data Types
- **Swap**: Complete swap state with cross-chain metadata
- **SwapStatus**: Enum tracking swap lifecycle (Pending, Active, Claimed, Refunded)
- **ResolverInfo**: 1inch Fusion+ resolver registration data
- **ContractStats**: Global contract analytics and metrics

#### Storage Layout
- **Persistent Storage**: Swap data, resolver registry, global statistics
- **Instance Storage**: Contract configuration, admin settings, fee parameters
- **Optimized Access**: Efficient key generation and data retrieval patterns

## 🚀 Quick Start

### Prerequisites

```bash
# Install Rust and Soroban CLI
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install --locked soroban-cli

# Add WebAssembly target
rustup target add wasm32-unknown-unknown

# Install Node.js dependencies for deployment scripts
cd scripts
npm install
```

### Build and Test

```bash
# Build the contract
cargo build --target wasm32-unknown-unknown --release

# Run all tests
cargo test

# Run with detailed output
cargo test -- --nocapture

# Run specific test suite
cargo test test_comprehensive
```

### Deployment

#### Testnet Deployment
```bash
# Set environment variables
export STELLAR_SECRET_KEY="your_stellar_secret_key"
export FEE_RECIPIENT="your_fee_recipient_address"
export PROTOCOL_FEE_BPS="30"

# Deploy to testnet
cd scripts
npm install
node deploy.js --network=testnet

# Verify deployment
node verify.js --network=testnet
```

## 📖 API Reference

### Contract Initialization

#### `initialize(admin, fee_recipient, protocol_fee_bps)`
Initialize the contract with administrative parameters.

**Parameters:**
- `admin: Address` - Contract administrator
- `fee_recipient: Address` - Protocol fee recipient  
- `protocol_fee_bps: u32` - Fee in basis points (max 500 = 5%)

### Core HTLC Functions

#### `create_swap(recipient, token, amount, hashlock, timelock, resolver_id)`
Create a new HTLC swap with specified parameters.

**Parameters:**
- `recipient: Address` - Swap recipient address
- `token: Address` - Token contract address
- `amount: i128` - Swap amount (in token's smallest unit)
- `hashlock: BytesN<32>` - SHA256 hash of the secret preimage
- `timelock: u64` - Expiration timestamp (Unix seconds)
- `resolver_id: String` - Optional 1inch resolver identifier

**Returns:** `String` - Unique swap identifier

**Events:** `SwapCreated`

#### `claim_swap(swap_id, preimage)`
Claim a swap by revealing the secret preimage.

**Parameters:**
- `swap_id: String` - Swap identifier
- `preimage: Bytes` - Secret that hashes to the hashlock

**Events:** `SwapClaimed`

#### `refund_swap(swap_id)`
Refund an expired swap to the original sender.

**Parameters:**
- `swap_id: String` - Swap identifier

**Events:** `SwapRefunded`

### Resolver Management

#### `register_resolver(resolver_id, fee_bps, api_endpoint)`
Register a new 1inch Fusion+ resolver.

**Parameters:**
- `resolver_id: String` - Unique resolver identifier
- `fee_bps: u32` - Resolver fee in basis points
- `api_endpoint: String` - Resolver API endpoint

**Authorization:** Admin only

### Query Functions

#### `get_swap(swap_id) -> Option<Swap>`
Retrieve swap details by ID.

#### `get_admin() -> Address`
Get current contract administrator.

#### `get_fee_recipient() -> Address`
Get protocol fee recipient address.

#### `get_protocol_fee() -> u32`
Get protocol fee in basis points.

#### `get_stats() -> ContractStats`
Get contract usage statistics.

## 🔄 Cross-Chain Integration

### Ethereum Interoperability

The Stellar HTLC contract is designed to work seamlessly with the Enhanced Ethereum CrossChainHTLC contract:

```javascript
// Example cross-chain swap coordination
const stellarSwap = await stellarContract.create_swap(
    recipient,
    tokenAddress,
    amount,
    hashlock,    // Same hash used on both chains
    timelock,
    resolverId
);

const ethereumSwap = await ethereumContract.createSwap(
    recipient,
    tokenAddress,
    amount,
    hashlock,    // Identical hashlock
    timelock,
    { value: fees }
);
```

### 1inch Fusion+ Integration

Professional liquidity routing through registered resolvers:

```rust
// Register resolver
stellar_contract.register_resolver(
    "1inch_fusion_plus",
    50, // 0.5% resolver fee
    "https://api.1inch.dev/fusion-plus"
);

// Create swap with resolver
stellar_contract.create_swap(
    recipient,
    token,
    amount,
    hashlock,
    timelock,
    "1inch_fusion_plus"
);
```

## 🧪 Testing

### Test Suites

#### Basic Tests (`test.rs`)
- Contract compilation verification
- Error code validation
- Basic function accessibility

#### Comprehensive Tests (`test_comprehensive.rs`)
- Contract initialization
- Complete swap lifecycle
- Resolver registration
- Cross-chain scenarios
- Error condition handling

### Running Tests

```bash
# All tests
cargo test

# Specific test
cargo test test_contract_initialization

# Test with output
cargo test -- --nocapture

# Test in release mode
cargo test --release
```

### Test Coverage
- ✅ Contract initialization and configuration
- ✅ Swap creation with validation
- ✅ Successful swap claiming
- ✅ Timelock-based refunds
- ✅ Resolver registration and management
- ✅ Error handling and edge cases
- ✅ Cross-chain compatibility scenarios

## 🔐 Security Considerations

### Access Control
- **Admin Functions**: Only contract admin can register resolvers and modify settings
- **Swap Authorization**: Proper sender verification for claims and refunds
- **Token Transfers**: Secure asset handling with proper validations

### Timelock Safety
- **Expiration Checks**: Strict timelock enforcement prevents double-spending
- **Clock Synchronization**: Uses Stellar ledger time for consistency
- **Buffer Periods**: Recommended minimum timelock durations

### Hash Security
- **SHA256 Requirements**: Only SHA256 hashes accepted for hashlocks
- **Preimage Validation**: Comprehensive preimage verification
- **Collision Resistance**: Cryptographically secure hash functions

## 📊 Gas Optimization

### Storage Efficiency
- **Minimal State**: Only essential data stored on-chain
- **Efficient Keys**: Optimized storage key generation
- **Batch Operations**: Where possible, operations are batched

### Execution Optimization
- **Early Returns**: Quick validation and early exit patterns
- **Minimal Loops**: Avoiding expensive iteration operations
- **Native Types**: Using Soroban-native types for efficiency

### Contract Size
- **Optimized Build**: Release builds produce minimal WASM (17KB)
- **No Dependencies**: Minimal external dependencies
- **Dead Code Elimination**: Unused code automatically removed

## 🚀 Deployment Guide

### Environment Setup

1. **Create Environment File**
```bash
cp scripts/.env.example scripts/.env
# Edit .env with your configuration
```

2. **Fund Deployment Account**
```bash
# Get testnet tokens
curl "https://friendbot.stellar.org?addr=YOUR_STELLAR_ADDRESS"
```

3. **Install Dependencies**
```bash
cd scripts
npm install
```

### Deployment Process

1. **Deploy Contract**
```bash
npm run deploy:testnet
# or for mainnet: npm run deploy:mainnet
```

2. **Verify Deployment**
```bash
npm run verify
```

3. **Initialize Contract**
The deployment script automatically initializes the contract with your configuration.

### Post-Deployment

1. **Register Resolvers** (Optional)
```javascript
await contract.register_resolver(
    "1inch_fusion_plus",
    50, // 0.5% fee
    "https://api.1inch.dev/fusion-plus"
);
```

2. **Test Integration**
```bash
npm run example
```

## 🔗 Integration Examples

### Basic HTLC Swap

```javascript
const StellarSdk = require('@stellar/stellar-sdk');

// Generate secret and hash
const secret = crypto.randomBytes(32);
const hashlock = crypto.createHash('sha256').update(secret).digest();

// Create swap
const swapId = await contract.create_swap(
    recipientAddress,
    tokenAddress,
    amount,
    hashlock,
    timelock,
    "" // No resolver
);

// Recipient claims with secret
await contract.claim_swap(swapId, secret);
```

### Cross-Chain Atomic Swap

```javascript
// 1. Create Stellar swap
const stellarSwapId = await stellarContract.create_swap(
    bobStellarAddress,
    stellarTokenAddress,
    stellarAmount,
    hashlock,
    timelock,
    "1inch_fusion_plus"
);

// 2. Create Ethereum swap
const ethereumTx = await ethereumContract.createSwap(
    bobEthereumAddress,
    ethereumTokenAddress,
    ethereumAmount,
    hashlock,
    timelock,
    { value: ethers.parseEther("0.01") }
);

// 3. Bob claims Ethereum swap (reveals secret)
const claimTx = await ethereumContract.claimSwap(ethereumSwapId, secret);

// 4. Alice uses revealed secret to claim Stellar swap
await stellarContract.claim_swap(stellarSwapId, secret);
```

### 1inch Fusion+ Integration

```javascript
// Register as a resolver
await contract.register_resolver(
    "professional_resolver",
    25, // 0.25% fee
    "https://api.example.com/resolve"
);

// Create swap with professional routing
const swapId = await contract.create_swap(
    recipient,
    token,
    amount,
    hashlock,
    timelock,
    "professional_resolver"
);
```

## 📈 Monitoring and Analytics

### Contract Events

Monitor contract activity through emitted events:
- `SwapCreated` - New swap initiated
- `SwapClaimed` - Swap successfully completed
- `SwapRefunded` - Swap expired and refunded
- `ResolverRegistered` - New resolver added

### Statistics Tracking

```javascript
const stats = await contract.get_stats();
console.log(`Total swaps: ${stats.total_swaps}`);
console.log(`Total volume: ${stats.total_volume}`);
console.log(`Active swaps: ${stats.active_swaps}`);
```

### Health Monitoring

```bash
# Verify contract status
node scripts/verify.js --network=testnet

# Check deployment health
node scripts/monitor.js
```

## 🤝 Contributing

### Development Setup

1. **Fork and Clone**
```bash
git clone https://github.com/your-org/unite-defi-stellar-fusionplus.git
cd unite-defi-stellar-fusionplus/smartcontracts/stellar
```

2. **Install Dependencies**
```bash
rustup target add wasm32-unknown-unknown
cargo install soroban-cli
```

3. **Run Tests**
```bash
cargo test
```

### Code Standards

- **Rust Style**: Follow standard Rust formatting (`cargo fmt`)
- **Documentation**: Comprehensive inline documentation
- **Testing**: All new features must include tests
- **Security**: Security-first development approach

### Pull Request Process

1. Create feature branch
2. Implement changes with tests
3. Update documentation
4. Submit pull request
5. Address review feedback

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Documentation
- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Stellar SDK Documentation](https://stellar.github.io/js-stellar-sdk/)
- [1inch Fusion+ API](https://docs.1inch.io/docs/fusion-plus/introduction)

### Community
- [Stellar Discord](https://discord.gg/stellar)
- [1inch Discord](https://discord.gg/1inch)
- [GitHub Issues](https://github.com/your-org/unite-defi-stellar-fusionplus/issues)

### Professional Support
For enterprise integration and custom development:
- Email: support@unite-defi.com
- Telegram: @unite_defi_support

---

**Built with ❤️ by the Unite DeFi Team**

*Enabling seamless cross-chain liquidity for the decentralized future.*
