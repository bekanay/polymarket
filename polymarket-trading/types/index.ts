// TypeScript types and interfaces

export interface Market {
    id: string;
    question: string;
    description?: string;
    volume: number;
    liquidity: number;
    closed: boolean;
    outcomes: Outcome[];
}

export interface Outcome {
    id: string;
    name: string;
    price: number;
}

export interface Order {
    id: string;
    marketId: string;
    side: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT' | 'STOP';
    amount: number;
    price?: number;
    stopPrice?: number;
    status: 'PENDING' | 'FILLED' | 'CANCELLED';
    createdAt: Date;
}

export interface Position {
    marketId: string;
    outcomeId: string;
    shares: number;
    avgPrice: number;
    currentPrice: number;
    pnl: number;
}

export interface User {
    address: string;
    proxyWallet?: string;
    email?: string;
}
