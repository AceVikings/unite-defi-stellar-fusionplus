# Fusion+ Cross-Chain Resolver Backend

## Overview

The Fusion+ Cross-Chain Resolver Backend is a Node.js service that coordinates cross-chain Dutch auction swaps between Ethereum and Stellar networks. It acts as an automated market maker and resolver, monitoring orders, evaluating profitability, and executing cross-chain atomic swaps using HTLCs (Hash Time Locked Contracts).

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Event         │    │   Order         │    │   Execution     │
│   Listeners     │    │   Evaluator     │    │   Engine        │
│                 │    │                 │    │                 │
│ - Ethereum      │───►│ - Price Calc    │───►│ - HTLC Mgmt     │
│ - Stellar       │    │ - Risk Assess   │    │ - Secret Relay  │
│ - WebSocket     │    │ - Profit Check  │    │ - Cross-Chain   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Database      │    │   Price Oracle  │    │   Monitoring    │
│   Manager       │    │   Service       │    │   & Alerts      │
│                 │    │                 │    │                 │
│ - Orders        │    │ - DEX Prices    │    │ - Health Check  │
│ - Secrets       │    │ - Market Data   │    │ - Metrics       │
│ - History       │    │ - Gas Prices    │    │ - Logging       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Core Components

### 1. Event Listeners (`/src/listeners/`)
- **EthereumListener**: Monitors Ethereum HTLC contract events
- **StellarListener**: Monitors Stellar Soroban contract events
- **WebSocketServer**: Provides real-time updates to frontend

### 2. Order Management (`/src/orders/`)
- **OrderEvaluator**: Calculates current Dutch auction prices
- **RiskManager**: Assesses order profitability and risks
- **OrderBook**: Manages active orders and their states

### 3. Execution Engine (`/src/execution/`)
- **CrossChainExecutor**: Coordinates cross-chain order execution
- **HTLCManager**: Manages Hash Time Locked Contracts
- **SecretManager**: Handles secret generation and propagation

### 4. Price Oracle (`/src/oracle/`)
- **PriceService**: Fetches market prices from DEXs
- **GasEstimator**: Estimates transaction costs
- **LiquidityChecker**: Monitors available liquidity

### 5. Database Layer (`/src/database/`)
- **Models**: Order, Secret, Transaction models
- **Repositories**: Data access layer
- **Migrations**: Database schema management

## Implementation Plan

### Phase 1: Project Setup & Core Infrastructure (Week 1)

#### Day 1-2: Project Initialization
- [x] Create project structure
- [ ] Initialize npm project with dependencies
- [ ] Setup TypeScript configuration (using JS with JSDoc for now)
- [ ] Configure environment variables
- [ ] Setup logging framework (Winston)
- [ ] Create Docker configuration

#### Day 3-4: Database Setup
- [ ] Setup PostgreSQL with connection pool
- [ ] Create database models (Orders, Secrets, Transactions)
- [ ] Implement migration system
- [ ] Setup Redis for caching

#### Day 5-7: Basic Event Listeners
- [ ] Ethereum Web3 connection and event listening
- [ ] Stellar RPC connection and event monitoring
- [ ] Basic event processing pipeline
- [ ] Event persistence to database

### Phase 2: Order Management System (Week 2)

#### Day 1-3: Order Processing
- [ ] Dutch auction price calculation engine
- [ ] Order state management system
- [ ] Order validation and sanitization
- [ ] Order expiration handling

#### Day 4-5: Risk Management
- [ ] Basic profitability calculator
- [ ] Risk assessment framework
- [ ] Position sizing logic
- [ ] Emergency stop mechanisms

#### Day 6-7: Price Oracle Integration
- [ ] DEX price aggregation (Uniswap, SushiSwap for ETH)
- [ ] Stellar DEX price fetching
- [ ] Gas price estimation
- [ ] Price caching and updates

### Phase 3: Cross-Chain Execution (Week 3)

#### Day 1-3: HTLC Management
- [ ] Secret generation and management
- [ ] Cross-chain HTLC creation
- [ ] Claim and refund mechanisms
- [ ] Timeout handling

#### Day 4-5: Execution Engine
- [ ] Order execution workflow
- [ ] Cross-chain coordination
- [ ] Transaction monitoring
- [ ] Failure recovery

#### Day 6-7: Testing & Integration
- [ ] Unit tests for core components
- [ ] Integration tests with test networks
- [ ] End-to-end workflow testing
- [ ] Performance optimization

### Phase 4: Advanced Features & Production (Week 4)

#### Day 1-2: Monitoring & Alerts
- [ ] Health check endpoints
- [ ] Metrics collection (Prometheus)
- [ ] Alert system for failures
- [ ] Dashboard integration

#### Day 3-4: API & WebSocket
- [ ] REST API for order status
- [ ] WebSocket server for real-time updates
- [ ] Authentication and rate limiting
- [ ] API documentation

#### Day 5-7: Production Readiness
- [ ] Security audit and hardening
- [ ] Performance tuning
- [ ] Deployment scripts
- [ ] Documentation and monitoring

## Technology Stack

### Core Dependencies
- **Node.js**: Runtime environment
- **Express.js**: Web framework for APIs
- **WebSocket**: Real-time communication
- **PostgreSQL**: Primary database
- **Redis**: Caching and session storage

### Blockchain Integration
- **Web3.js/Ethers.js**: Ethereum blockchain interaction
- **Stellar SDK**: Stellar network interaction
- **Soroban RPC**: Stellar smart contract interaction

### Monitoring & Logging
- **Winston**: Structured logging
- **Prometheus**: Metrics collection
- **Grafana**: Dashboard and visualization
- **Sentry**: Error tracking

### Development Tools
- **Jest**: Testing framework
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **Docker**: Containerization
- **GitHub Actions**: CI/CD

## Directory Structure

```
backend/
├── src/
│   ├── listeners/           # Event listeners for both chains
│   │   ├── ethereum.js      # Ethereum event listener
│   │   ├── stellar.js       # Stellar event listener
│   │   └── websocket.js     # WebSocket server
│   ├── orders/              # Order management
│   │   ├── evaluator.js     # Dutch auction price calculator
│   │   ├── manager.js       # Order lifecycle management
│   │   └── risk.js          # Risk assessment
│   ├── execution/           # Cross-chain execution
│   │   ├── executor.js      # Main execution engine
│   │   ├── htlc.js          # HTLC management
│   │   └── secrets.js       # Secret management
│   ├── oracle/              # Price and market data
│   │   ├── prices.js        # Price aggregation
│   │   ├── gas.js           # Gas estimation
│   │   └── liquidity.js     # Liquidity monitoring
│   ├── database/            # Database layer
│   │   ├── models/          # Data models
│   │   ├── repositories/    # Data access layer
│   │   └── migrations/      # Schema migrations
│   ├── api/                 # REST API endpoints
│   │   ├── routes/          # API routes
│   │   └── middleware/      # Express middleware
│   ├── utils/               # Utility functions
│   │   ├── crypto.js        # Cryptographic utilities
│   │   ├── logger.js        # Logging configuration
│   │   └── config.js        # Configuration management
│   └── app.js               # Main application entry point
├── tests/                   # Test files
│   ├── unit/                # Unit tests
│   ├── integration/         # Integration tests
│   └── e2e/                 # End-to-end tests
├── config/                  # Configuration files
│   ├── database.js          # Database configuration
│   └── blockchain.js        # Blockchain configurations
├── scripts/                 # Utility scripts
│   ├── migrate.js           # Database migration
│   └── seed.js              # Test data seeding
├── docker/                  # Docker configuration
│   ├── Dockerfile
│   └── docker-compose.yml
├── docs/                    # Documentation
├── package.json             # Project dependencies
├── .env.example             # Environment variables template
└── README.md                # This file
```

## Environment Variables

```bash
# Blockchain Configuration
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/your-key
ETHEREUM_PRIVATE_KEY=your-private-key
ETHEREUM_CONTRACT_ADDRESS=0x...

STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_SECRET_KEY=S...
STELLAR_CONTRACT_ID=C...

# Database Configuration
DATABASE_URL=postgresql://user:pass@localhost:5432/fusionplus
REDIS_URL=redis://localhost:6379

# API Configuration
PORT=3000
JWT_SECRET=your-jwt-secret
API_RATE_LIMIT=100

# Monitoring
SENTRY_DSN=your-sentry-dsn
LOG_LEVEL=info

# Resolver Configuration
MIN_PROFIT_MARGIN=0.01
MAX_ORDER_SIZE=100000
RESOLVER_BOND_AMOUNT=1000
```

## Getting Started

### Prerequisites
- Node.js >= 18.0.0
- PostgreSQL >= 13
- Redis >= 6.0
- Docker (optional)

### Installation

1. **Clone and setup:**
   ```bash
   cd backend
   npm install
   ```

2. **Environment setup:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Database setup:**
   ```bash
   npm run db:create
   npm run db:migrate
   npm run db:seed
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

5. **Run tests:**
   ```bash
   npm test
   npm run test:integration
   ```

## API Endpoints

### Order Management
- `GET /api/orders` - List active orders
- `GET /api/orders/:id` - Get order details
- `POST /api/orders/:id/execute` - Execute order (resolver only)

### Monitoring
- `GET /api/health` - Health check
- `GET /api/metrics` - Prometheus metrics
- `GET /api/status` - Service status

### WebSocket Events
- `order_created` - New order detected
- `order_updated` - Order status changed
- `order_executed` - Order execution completed
- `price_update` - Dutch auction price update

## Security Considerations

### Key Management
- Private keys stored in secure environment variables
- Hardware wallet integration for production
- Secret rotation policies

### API Security
- Rate limiting on all endpoints
- JWT authentication for protected routes
- Input validation and sanitization
- CORS configuration

### Cross-Chain Security
- Proper HTLC timeout coordination
- Secret management best practices
- Transaction monitoring and alerting
- Emergency stop mechanisms

## Monitoring & Alerting

### Health Checks
- Database connectivity
- Blockchain node connectivity
- Event listener status
- Memory and CPU usage

### Alerts
- Failed order executions
- Blockchain connection issues
- Unusual profit/loss patterns
- System resource exhaustion

### Metrics
- Orders processed per hour
- Average execution time
- Profit/loss tracking
- Error rates by component

## Deployment

### Development
```bash
npm run dev
```

### Production
```bash
docker-compose up -d
```

### Scaling
- Horizontal scaling with load balancer
- Database read replicas
- Redis clustering
- Microservice separation

This comprehensive plan will guide the implementation of a robust, production-ready resolver backend that can handle cross-chain Dutch auction swaps safely and profitably.
