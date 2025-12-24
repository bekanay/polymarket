# Polymarket Trading Interface - Implementation Plan

## Project Overview

This plan outlines the step-by-step implementation of a simplified Polymarket trading interface that addresses limitations in the current CLOB API, with enhanced order functionality including market and stop orders.

**Timeline**: 7-10 days  
**Tech Stack**: Next.js (frontend), Privy (auth & gas sponsorship), Polymarket CLOB API, potentially FastAPI (backend for bonus features)

---

## Phase 1: Project Setup & Environment (Day 1)

### 1.1 Initial Project Setup
```bash
npx create-next-app@latest polymarket-trading --typescript --tailwind --app
cd polymarket-trading
```

**Dependencies to install**:
- `@privy-io/react-auth` - Authentication
- `@privy-io/server-auth` - Server-side auth
- `ethers` or `viem` - Ethereum interactions
- `axios` - API requests
- `@gnosis.pm/safe-core-sdk` - Gnosis Safe integration
- `@polymarket/clob-client` - Polymarket CLOB client
- `recharts` or `lightweight-charts` - Price charts
- `ws` - WebSocket client (bonus)

### 1.2 Create Polygon Wallet
- Set up MetaMask or equivalent
- Create wallet on Polygon network
- Share address with @royalnine on Telegram for funding
- Save private keys securely (use `.env.local`, never commit)

### 1.3 Environment Configuration
Create `.env.local`:
```env
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_secret
NEXT_PUBLIC_POLYGON_RPC_URL=https://polygon-rpc.com
POLYGON_WALLET_PRIVATE_KEY=your_funded_wallet_key
NEXT_PUBLIC_POLYMARKET_CLOB_API=https://clob.polymarket.com
```

### 1.4 Project Structure
```
polymarket-trading/
├── src/
│   ├── app/              # Next.js app router
│   ├── components/       # React components
│   │   ├── wallet/       # Wallet-related components
│   │   ├── trading/      # Trading interface components
│   │   └── markets/      # Market display components
│   ├── lib/              # Utilities and clients
│   │   ├── polymarket/   # CLOB API client
│   │   ├── wallet/       # Wallet utilities
│   │   └── privy/        # Privy configuration
│   ├── hooks/            # Custom React hooks
│   ├── types/            # TypeScript types
│   └── constants/        # App constants
├── public/               # Static assets
└── api/ (optional)       # Backend for bonus features
```

---

## Phase 2: Authentication & Wallet Infrastructure (Days 2-3)

### 2.1 Privy Integration
**Goal**: Enable users to authenticate and connect wallets with gas-sponsored transactions.

**Implementation Steps**:

1. **Configure Privy Provider** (`src/lib/privy/config.ts`):
   ```typescript
   import { PrivyProvider } from '@privy-io/react-auth';
   
   export const privyConfig = {
     appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
     config: {
       loginMethods: ['email', 'wallet', 'google'],
       appearance: {
         theme: 'dark',
         accentColor: '#676FFF',
       },
       embeddedWallets: {
         createOnLogin: 'users-without-wallets',
       },
     },
   };
   ```

2. **Wrap App with Privy** (`src/app/layout.tsx`):
   - Wrap root layout with `PrivyProvider`
   - Configure for Polygon network

3. **Create Authentication Components**:
   - `LoginButton.tsx` - Trigger Privy login
   - `WalletInfo.tsx` - Display connected wallet
   - `DisconnectButton.tsx` - Logout functionality

### 2.2 Proxy Wallet Implementation (Gnosis Safe)
**Goal**: Create and manage proxy wallets for each user.

**Key Concepts**:
- Proxy wallets enable gas-sponsored transactions
- Use Gnosis Safe Factory pattern
- 1 proxy wallet per user

**Implementation Steps**:

1. **Create Proxy Wallet Service** (`src/lib/wallet/proxyWallet.ts`):
   ```typescript
   import { SafeFactory } from '@gnosis.pm/safe-core-sdk';
   
   export class ProxyWalletService {
     async createProxyWallet(ownerAddress: string) {
       // Initialize Safe Factory
       // Deploy new proxy wallet
       // Return proxy wallet address
     }
     
     async getProxyWallet(userAddress: string) {
       // Check if user has existing proxy wallet
       // Return address or null
     }
   }
   ```

2. **Storage Strategy**:
   - Store mapping: `userWallet -> proxyWallet` in localStorage initially
   - For production: use database (Postgres/MongoDB)

3. **Proxy Wallet Component** (`src/components/wallet/ProxyWallet.tsx`):
   - Check if user has proxy wallet
   - If not, show "Create Proxy Wallet" button
   - Display proxy wallet address and balance
   - Show funding interface

### 2.3 Wallet Funding via Privy
**Implementation Steps**:

1. **Create Funding Component** (`src/components/wallet/FundWallet.tsx`):
   - Input field for amount
   - Transfer from embedded wallet to proxy wallet
   - Use Privy's gas sponsorship for transfers
   - Display transaction status

2. **Transaction Flow**:
   ```typescript
   // User clicks "Fund Proxy Wallet"
   // Privy sponsors gas for transfer
   // Transfer USDC from embedded wallet -> proxy wallet
   // Update UI with new balances
   ```

---

## Phase 3: Polymarket CLOB API Integration (Days 3-4)

### 3.1 CLOB Client Setup
**Goal**: Connect to Polymarket's CLOB API for market data and order execution.

**Implementation Steps**:

1. **Create CLOB Client** (`src/lib/polymarket/clobClient.ts`):
   ```typescript
   import { ClobClient } from '@polymarket/clob-client';
   
   export class PolymarketService {
     private client: ClobClient;
     
     async getMarkets() { /* Fetch available markets */ }
     async getOrderBook(tokenId: string) { /* Get order book */ }
     async getPriceHistory(tokenId: string) { /* Get historical prices */ }
     async createOrder(params) { /* Create market/stop order */ }
     async getUserOrders(address: string) { /* Get user's orders */ }
     async getUserPositions(address: string) { /* Get user's positions */ }
   }
   ```

2. **API Endpoints to Use**:
   - `GET /markets` - List markets
   - `GET /book?token_id=<id>` - Order book
   - `GET /prices` - Price data
   - `POST /order` - Create order
   - `GET /orders?address=<addr>` - User orders
   - `GET /positions?address=<addr>` - User positions

3. **Create React Hooks** (`src/hooks/`):
   - `useMarkets()` - Fetch and cache markets
   - `useOrderBook(tokenId)` - Real-time order book
   - `usePriceHistory(tokenId)` - Historical prices
   - `useUserOrders()` - User's active orders
   - `useUserPositions()` - User's positions

### 3.2 Market Selection & Curation
**Criteria for Market Selection**:
- Markets with high liquidity (volume > $10k)
- Active markets (not resolved)
- Popular categories: Politics, Crypto, Sports
- Display top 10-20 markets

**Implementation**:
```typescript
// Filter and sort markets
const curatedMarkets = markets
  .filter(m => m.volume > 10000 && !m.closed)
  .sort((a, b) => b.volume - a.volume)
  .slice(0, 20);
```

---

## Phase 4: Trading Interface UI (Days 4-5)

### 4.1 Market List View
**Component**: `src/components/markets/MarketList.tsx`

**Features**:
- Display curated markets
- Show: title, current price, 24h change, volume
- Click to navigate to trading interface
- Search/filter functionality

### 4.2 Trading Interface
**Component**: `src/components/trading/TradingView.tsx`

**Layout Structure**:
```
┌─────────────────────────────────────────────┐
│ Market Header (Title, Price, Stats)        │
├──────────────────┬──────────────────────────┤
│                  │                          │
│  Order Book      │  Price Chart             │
│  (Bids/Asks)     │  (Historical)            │
│                  │                          │
├──────────────────┴──────────────────────────┤
│  Order Creation Panel                       │
│  [Buy] [Sell] [Market] [Stop]              │
├─────────────────────────────────────────────┤
│  User Activity                              │
│  [Orders] [Positions]                       │
└─────────────────────────────────────────────┘
```

**Sub-Components**:

1. **OrderBook.tsx**:
   - Display bids (buy orders) in green
   - Display asks (sell orders) in red
   - Show price, size, total
   - Click to populate order form

2. **PriceChart.tsx**:
   - Use `recharts` or `lightweight-charts`
   - Display candlestick or line chart
   - Time range selector (1H, 24H, 7D, 30D)

3. **OrderForm.tsx**:
   - Tabs: Market Order vs Stop Order
   - Buy/Sell toggle
   - Amount input
   - Price input (for stop orders)
   - Submit button
   - Order preview

4. **UserActivity.tsx**:
   - **Orders Tab**: Active orders with cancel button
   - **Positions Tab**: Current positions with P&L

---

## Phase 5: Order Execution (Days 5-6)

### 5.1 Market Orders
**Goal**: Execute immediate buy/sell at current market price.

**Implementation** (`src/lib/polymarket/orders.ts`):

```typescript
export async function createMarketOrder(params: {
  side: 'BUY' | 'SELL';
  tokenId: string;
  amount: number;
  proxyWallet: string;
}) {
  // 1. Get current best price from order book
  // 2. Create order payload
  // 3. Sign with proxy wallet
  // 4. Submit via CLOB API with Privy gas sponsorship
  // 5. Return order confirmation
}
```

**Key Points**:
- Use Privy to sponsor gas for order signatures
- Handle order signing with proxy wallet private key
- Display order confirmation/error states

### 5.2 Stop Orders
**Goal**: Place conditional orders that execute when price reaches target.

**Implementation**:

```typescript
export async function createStopOrder(params: {
  side: 'BUY' | 'SELL';
  tokenId: string;
  amount: number;
  stopPrice: number;
  proxyWallet: string;
}) {
  // 1. Create stop order via CLOB API
  // 2. Document any limitations encountered
  // 3. Return order ID for tracking
}
```

**CRITICAL - Document Limitations**:
Create `CLOB_LIMITATIONS.md` file to document:
- Does CLOB API natively support stop orders?
- If not, what alternatives exist?
- What order types ARE supported?
- Any issues with order execution, cancellation, or gas sponsorship?

Expected findings:
- CLOB might not support stop-loss/stop-limit natively
- May need to implement monitoring system (bonus feature)

---

## Phase 6: Documentation & Testing (Day 6-7)

### 6.1 Create README.md

**Sections**:

```markdown
# Polymarket Trading Interface

## Overview
Brief description of the project

## Features
- ✅ Privy authentication
- ✅ Proxy wallet creation (Gnosis Safe)
- ✅ Market order execution
- ✅ Stop order implementation
- ✅ Real-time order book
- ✅ Price history charts
- ✅ User orders & positions

## Setup Instructions
1. Clone repository
2. Install dependencies: `npm install`
3. Configure environment variables
4. Run development server: `npm run dev`

## Environment Variables
[List all required variables]

## Architecture Decisions
### Authentication
[Explain Privy choice and implementation]

### Proxy Wallets
[Explain Gnosis Safe usage]

### Order Execution
[Explain order flow and gas sponsorship]

## CLOB API Limitations
[Document discovered limitations - link to separate file]

## Project Structure
[Explain folder organization]

## Known Issues
[List any bugs or limitations]
```

### 6.2 Create CLOB_LIMITATIONS.md

Document all discovered limitations, for example:

```markdown
# Polymarket CLOB API Limitations

## Stop Orders
**Finding**: CLOB does not natively support stop-loss or stop-limit orders.

**Current Behavior**:
- Only market and limit orders are supported
- No conditional order triggers

**Workaround Required**:
- Backend monitoring system needed
- Poll price data
- Execute market order when condition met

## [Other limitations discovered during implementation]
```

### 6.3 Testing Checklist
- [ ] User can login with Privy
- [ ] Proxy wallet is created successfully
- [ ] Wallet can be funded
- [ ] Markets load and display correctly
- [ ] Order book updates properly
- [ ] Price chart renders
- [ ] Market order executes successfully
- [ ] Stop order is created (or limitation documented)
- [ ] User orders display correctly
- [ ] Positions show accurate P&L
- [ ] Gas sponsorship works for all transactions

---

## Phase 7: Bonus Features (Days 7+)

### 7.1 WebSocket Real-Time Updates
**Goal**: Use WebSocket for live order book and price updates.

**Implementation** (`src/lib/polymarket/websocket.ts`):

```typescript
export class PolymarketWebSocket {
  private ws: WebSocket;
  
  subscribeToOrderBook(tokenId: string, callback: Function) {
    // Subscribe to order book updates
    // Emit updates to callback
  }
  
  subscribeToPrices(tokenId: string, callback: Function) {
    // Subscribe to price updates
  }
  
  unsubscribe(subscription: string) {
    // Clean up subscription
  }
}
```

**React Hook** (`src/hooks/useRealtimeOrderBook.ts`):
```typescript
export function useRealtimeOrderBook(tokenId: string) {
  const [orderBook, setOrderBook] = useState(null);
  
  useEffect(() => {
    const ws = new PolymarketWebSocket();
    ws.subscribeToOrderBook(tokenId, setOrderBook);
    return () => ws.unsubscribe();
  }, [tokenId]);
  
  return orderBook;
}
```

### 7.2 Backend for Stop Orders
**Goal**: Build backend service to monitor prices and execute stop orders.

**Architecture**:

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Frontend   │─────▶│   Backend    │─────▶│  Polymarket  │
│   (Next.js)  │      │   (FastAPI)  │      │   CLOB API   │
└──────────────┘      └──────────────┘      └──────────────┘
                             │
                             ▼
                      ┌──────────────┐
                      │   Database   │
                      │  (Postgres)  │
                      └──────────────┘
```

**Backend Setup**:

1. **Create FastAPI App** (`api/main.py`):
```python
from fastapi import FastAPI
from sqlalchemy import create_engine

app = FastAPI()

@app.post("/stop-order")
async def create_stop_order(order: StopOrder):
    # Store stop order in database
    # Return order ID
    
@app.get("/stop-orders/{user_address}")
async def get_user_stop_orders(user_address: str):
    # Query database for user's stop orders
```

2. **Database Schema**:
```sql
CREATE TABLE stop_orders (
    id SERIAL PRIMARY KEY,
    user_address VARCHAR(42),
    proxy_wallet VARCHAR(42),
    token_id VARCHAR(66),
    side VARCHAR(4),
    amount DECIMAL,
    stop_price DECIMAL,
    status VARCHAR(20), -- PENDING, TRIGGERED, CANCELLED
    created_at TIMESTAMP,
    executed_at TIMESTAMP
);
```

3. **Price Monitor** (`api/monitor.py`):
```python
import asyncio

async def monitor_stop_orders():
    while True:
        # 1. Fetch all PENDING stop orders
        # 2. Get current prices for each token
        # 3. Check if stop price is reached
        # 4. If yes, execute market order via CLOB
        # 5. Update order status to TRIGGERED
        await asyncio.sleep(5)  # Check every 5 seconds
```

4. **Integration**:
   - Frontend creates stop order via backend API
   - Backend stores in database
   - Monitor service polls prices
   - When trigger price hit, executes as market order
   - Frontend queries backend for stop order status

**Stop Order Type That Works**:
- Stop-limit that converts to **market order** when triggered
- Why: Guarantees execution once condition is met
- Trade-off: May execute at worse price than expected in volatile markets

---

## Git Workflow

### Initial Commit Structure
```
commit 1: Initial Next.js setup
commit 2: Add Privy authentication
commit 3: Configure environment and dependencies
commit 4: Create project structure
commit 5: Implement Gnosis Safe proxy wallet service
commit 6: Add proxy wallet UI components
commit 7: Implement wallet funding
commit 8: Add Polymarket CLOB client
commit 9: Create market data hooks
commit 10: Build market list component
commit 11: Create trading view layout
commit 12: Implement order book component
commit 13: Add price chart component
commit 14: Build order form UI
commit 15: Implement market order execution
commit 16: Add stop order creation
commit 17: Document CLOB limitations
commit 18: Implement user orders display
commit 19: Add positions tracking
commit 20: Create README documentation
... (continue with small, focused commits)
```

### CLAUDE.md Tips
Create `CLAUDE.md` in root:
```markdown
# AI Coding Context

## Project Overview
Polymarket trading interface with proxy wallets and enhanced orders

## Key Patterns
- Use TypeScript strict mode
- All API calls in src/lib
- React hooks for data fetching
- Component composition over monoliths

## Architecture Decisions
[Document why you chose certain patterns]

## Common Tasks
### Adding New Market Component
1. Create component in src/components/markets
2. Add types to src/types
3. Create hook if data fetching needed

## Gotchas
- Always use proxy wallet for orders, not user's main wallet
- All transactions must be gas-sponsored via Privy
```

---

## Timeline Summary

| Day | Phase | Key Deliverables |
|-----|-------|------------------|
| 1 | Setup | Project initialized, dependencies installed, wallet created |
| 2 | Auth | Privy integrated, login working |
| 3 | Wallets | Proxy wallet creation, funding interface |
| 4 | API | CLOB client, market data hooks |
| 5 | UI | Trading interface, order book, charts |
| 6 | Trading | Market & stop orders implemented |
| 7 | Polish | Documentation, testing, bug fixes |
| 8+ | Bonus | WebSocket, backend for stop orders |

---

## Success Criteria Checklist

### Core Requirements
- [ ] Privy authentication working
- [ ] Proxy wallet (Gnosis Safe) created per user
- [ ] Wallet funding via Privy
- [ ] Markets displayed with selection criteria
- [ ] Order book showing bids/asks
- [ ] Price history chart
- [ ] User orders displayed
- [ ] User positions displayed
- [ ] Market orders execute via CLOB
- [ ] Stop orders implemented (or limitations documented)
- [ ] All orders gas-sponsored via Privy
- [ ] README with setup, architecture, limitations
- [ ] Small, frequent commits

### Bonus
- [ ] WebSocket for real-time data
- [ ] Backend service for stop orders
- [ ] Database for stop order storage
- [ ] Price monitoring & execution system

---

## Critical Notes

> [!IMPORTANT]
> **Gas Sponsorship**: Every transaction (wallet creation, funding, orders) must use Privy's gas sponsorship. Coordinate with @royalnine to be added to team account.

> [!WARNING]
> **CLOB Limitations**: The CLOB API likely does NOT support stop orders natively. You will need to discover this during implementation and document thoroughly. This is expected and part of the evaluation.

> [!CAUTION]
> **Private Keys**: NEVER commit private keys or secrets. Use `.env.local` and add to `.gitignore`. The funded wallet private key is sensitive.

---

## Next Steps

1. **Immediate Actions**:
   - Create Polygon wallet
   - Contact @royalnine on Telegram with wallet address
   - Request Privy team account access
   - Initialize Next.js project

2. **First Development Session**:
   - Set up development environment
   - Install all dependencies
   - Configure Privy
   - Create basic project structure

3. **Ongoing**:
   - Commit frequently with descriptive messages
   - Document decisions in CLAUDE.md
   - Track CLOB limitations as discovered
   - Test each feature before moving to next phase
