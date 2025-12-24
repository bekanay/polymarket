// Application constants

export const POLYMARKET_CLOB_API = process.env.NEXT_PUBLIC_POLYMARKET_CLOB_API || 'https://clob.polymarket.com';

export const POLYGON_CHAIN_ID = 137;

export const SUPPORTED_TOKENS = {
    USDC: {
        address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        decimals: 6,
        symbol: 'USDC',
    },
} as const;

export const ORDER_TYPES = {
    MARKET: 'MARKET',
    LIMIT: 'LIMIT',
    STOP: 'STOP',
} as const;

export const ORDER_SIDES = {
    BUY: 'BUY',
    SELL: 'SELL',
} as const;

export const MIN_ORDER_AMOUNT = 1; // Minimum order amount in USDC
export const MAX_SLIPPAGE = 0.05; // 5% max slippage for market orders
