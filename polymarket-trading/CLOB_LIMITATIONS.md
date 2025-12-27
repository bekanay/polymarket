# Polymarket CLOB API Limitations

## Overview

This document details the capabilities and limitations of the Polymarket Central Limit Order Book (CLOB) API for order execution.

---

## Supported Order Types

| Order Type | Supported | Description |
|------------|-----------|-------------|
| **GTC (Good-Til-Cancelled)** | ✅ Yes | Limit order that stays active until filled or cancelled |
| **GTD (Good-Til-Date)** | ✅ Yes | Limit order with expiration date |
| **FOK (Fill-Or-Kill)** | ✅ Yes | Must fill entirely immediately or cancel |
| **FAK (Fill-And-Kill)** | ✅ Yes | Fill available shares immediately, cancel remainder |
| **Market Order** | ✅ Yes | Via `createAndPostMarketOrder` with FOK type |

---

## ⚠️ NOT Supported Natively

| Order Type | Status | Alternative |
|------------|--------|-------------|
| **Stop Orders** | ❌ Not Supported | Requires client-side price monitoring |
| **Stop-Loss** | ❌ Not Supported | Must implement monitoring system |
| **Stop-Limit** | ❌ Not Supported | Must implement monitoring system |
| **Take-Profit** | ❌ Not Supported | Must implement monitoring system |
| **Trailing Stop** | ❌ Not Supported | Requires complex monitoring |

---

## Order Execution Architecture

```
User Action → Order Form UI → orders.ts
                                  ↓
                        PolymarketService.createMarketOrder()
                                  ↓
                        @polymarket/clob-client 
                                  ↓
                        CLOB API (clob.polymarket.com)
                                  ↓
                        On-chain Settlement (Polygon)
```

---

## Key API Constraints

### Authentication
- Requires L1 (private key) or L2 (API key) authentication
- API keys derived from wallet signature
- Proxy wallet can be used as funder address

### Rate Limits
- GET endpoints: 100 requests/10 seconds
- POST endpoints: 20 requests/10 seconds

### Order Requirements
- `tokenId`: Required - identifies Yes/No outcome token
- `price`: Required - between 0 and 1 (e.g., 0.65 = 65%)
- `size`: Required - number of shares
- `side`: Required - BUY or SELL

### Minimum Sizes
- Determined per-market by `minimum_order_size` field
- Typical minimum: ~1 USDC worth

---

## Stop Order Implementation Options

Since CLOB doesn't support stop orders natively:

### Option 1: Client-Side Polling (Implemented)
- Store pending stop orders in localStorage
- Poll prices every 5-10 seconds
- Execute market order when stop price triggers
- **Limitation**: Only works while browser is open

### Option 2: Server-Side Monitoring (Future)
- Requires backend service
- Store stop orders in database
- Server polls prices and executes orders
- **Benefit**: Works 24/7

### Option 3: WebSocket Monitoring (Future)
- Subscribe to price updates via WebSocket
- Lower latency than polling
- Still requires active connection

---

## Gas Sponsorship

- Privy can sponsor gas for embedded wallets
- Order signing is off-chain (no gas for signatures)
- On-chain settlement gas handled by CLOB operator
- Users only need USDC balance for trading

---

## References

- [CLOB API Documentation](https://docs.polymarket.com/#clob-api)
- [@polymarket/clob-client NPM](https://www.npmjs.com/package/@polymarket/clob-client)
- [Order Types API Docs](https://docs.polymarket.com/#order-endpoints)
