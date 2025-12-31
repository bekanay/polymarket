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
