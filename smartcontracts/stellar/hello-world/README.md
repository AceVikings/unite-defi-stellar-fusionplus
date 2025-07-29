# Soroban Hello World Smart Contract

A basic "Hello World" smart contract built with Soroban on the Stellar network. This project demonstrates the fundamental concepts of Soroban smart contract development, deployment, and interaction.

## 🌟 Features

- **Simple Hello Function**: Takes a name as input and returns a greeting
- **Comprehensive Testing**: Unit tests using Soroban SDK test utilities
- **Automated Deployment**: Scripts for easy contract deployment
- **Interactive Examples**: Scripts to demonstrate contract interaction

## 🏗️ Project Structure

```text
.
├── contracts/
│   └── hello-world/
│       ├── src/
│       │   ├── lib.rs      # Main contract logic
│       │   └── test.rs     # Unit tests
│       ├── Cargo.toml      # Contract dependencies
│       └── Makefile        # Build automation
├── deploy.sh               # Deployment script
├── setup.sh               # Environment setup script
├── interact.sh             # Contract interaction examples
├── Cargo.toml             # Workspace configuration
└── README.md              # This file
```

## 🚀 Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable version)
- [Soroban CLI](https://soroban.stellar.org/docs/getting-started/setup) v23.0.0+

### Installation & Setup

1. **Setup Development Environment**
   ```bash
   ./setup.sh
   ```
   This script will:
   - Configure testnet and local network endpoints
   - Create a test account (`alice`)
   - Fund the account using Stellar's friendbot

2. **Build the Contract**
   ```bash
   cargo build --target wasm32-unknown-unknown --release
   ```

3. **Run Tests**
   ```bash
   cargo test
   ```

4. **Deploy to Testnet**
   ```bash
   ./deploy.sh
   ```

5. **Interact with the Contract**
   ```bash
   ./interact.sh
   ```

## 📖 Understanding the Contract

### Contract Code

The hello world contract is defined in `contracts/hello-world/src/lib.rs`:

```rust
#[contract]
pub struct Contract;

#[contractimpl]
impl Contract {
    pub fn hello(env: Env, to: String) -> Vec<String> {
        vec![&env, String::from_str(&env, "Hello"), to]
    }
}
```

### Key Concepts

- **`#[contract]`**: Marks the struct as a Soroban contract
- **`#[contractimpl]`**: Defines the contract's public interface
- **`Env`**: Provides access to the Soroban environment and host functions
- **Return Type**: Returns a vector of strings: `["Hello", "YourName"]`

## 🔧 Manual Commands

### Building
```bash
# Build for development
cargo build

# Build optimized WASM for deployment
cargo build --target wasm32-unknown-unknown --release

# Optimize WASM file
soroban contract optimize --wasm target/wasm32-unknown-unknown/release/hello_world.wasm
```

### Testing
```bash
# Run all tests
cargo test

# Run tests with output
cargo test -- --nocapture
```

### Deployment
```bash
# Deploy to testnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/hello_world.wasm \
  --source alice \
  --network testnet

# Deploy to local network (requires local stellar-core)
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/hello_world.wasm \
  --source alice \
  --network local
```

### Contract Interaction
```bash
# Call the hello function
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source alice \
  --network testnet \
  -- \
  hello \
  --to "World"
```

## 🌐 Networks

### Testnet
- **RPC URL**: `https://soroban-testnet.stellar.org:443`
- **Network Passphrase**: `Test SDF Network ; September 2015`
- **Friendbot**: `https://friendbot.stellar.org/`

### Local Development
- **RPC URL**: `http://localhost:8000/soroban/rpc`
- **Network Passphrase**: `Standalone Network ; February 2017`
- **Requirements**: Local Stellar Core instance

## 🧪 Testing Examples

The contract includes comprehensive tests demonstrating:

```rust
#[test]
fn test() {
    let env = Env::default();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let words = client.hello(&String::from_str(&env, "Dev"));
    assert_eq!(
        words,
        vec![
            &env,
            String::from_str(&env, "Hello"),
            String::from_str(&env, "Dev"),
        ]
    );
}
```

## 📚 Next Steps

1. **Explore Soroban Examples**: Check out [soroban-examples](https://github.com/stellar/soroban-examples)
2. **Build Complex Contracts**: Try implementing tokens, voting, or DeFi protocols
3. **Frontend Integration**: Connect your contract to a web frontend
4. **Production Deployment**: Deploy to Stellar Mainnet

## 🔗 Resources

- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Stellar Developer Portal](https://developers.stellar.org/)
- [Soroban CLI Reference](https://soroban.stellar.org/docs/tools/cli)
- [Rust Programming Language](https://doc.rust-lang.org/book/)

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
