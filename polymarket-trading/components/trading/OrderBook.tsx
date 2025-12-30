/**
 * OrderBook Component
 * 
 * Displays bids (buy orders) and asks (sell orders) for a market.
 * Click on a price to populate the order form.
 * Uses WebSocket for real-time updates with HTTP fallback.
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getPolymarketService, type OrderBookSummary } from '@/lib/polymarket';
import { useWebSocket } from '@/hooks/useWebSocket';

interface OrderBookProps {
    tokenId: string;
    onPriceClick?: (price: number, side: 'buy' | 'sell') => void;
}

interface OrderBookLevel {
    price: number;
    size: number;
    total: number;
}

export function OrderBook({ tokenId, onPriceClick }: OrderBookProps) {
    const [orderBook, setOrderBook] = useState<OrderBookSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Memoize tokenIds array to prevent useWebSocket re-subscriptions
    const tokenIds = useMemo(() => tokenId ? [tokenId] : [], [tokenId]);

    // WebSocket for real-time updates
    const { isConnected, orderBook: wsOrderBook } = useWebSocket({
        tokenIds,
        onBookUpdate: useCallback((tid: string, bids: { price: string; size: string }[], asks: { price: string; size: string }[]) => {
            if (tid === tokenId) {
                setOrderBook({ bids, asks } as OrderBookSummary);
            }
        }, [tokenId]),
    });

    // Update from WebSocket when received
    useEffect(() => {
        if (wsOrderBook) {
            setOrderBook({
                bids: wsOrderBook.bids,
                asks: wsOrderBook.asks,
            } as OrderBookSummary);
        }
    }, [wsOrderBook]);

    const fetchOrderBook = useCallback(async () => {
        if (!tokenId) return;

        try {
            const service = getPolymarketService();
            const book = await service.getOrderBook(tokenId);
            setOrderBook(book);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load order book');
        } finally {
            setIsLoading(false);
        }
    }, [tokenId]);

    // Initial fetch via HTTP (WebSocket will take over after connection)
    useEffect(() => {
        fetchOrderBook();

        // Fallback polling only if WebSocket is not connected
        const interval = setInterval(() => {
            if (!isConnected) {
                fetchOrderBook();
            }
        }, 10000); // Poll less frequently since WS is primary

        return () => clearInterval(interval);
    }, [fetchOrderBook, isConnected]);

    // Parse order book data into display format
    const parseLevels = (
        levels: { price: string; size: string }[] | undefined,
        ascending: boolean
    ): OrderBookLevel[] => {
        if (!levels || levels.length === 0) return [];

        const parsed = levels.map(level => ({
            price: parseFloat(level.price),
            size: parseFloat(level.size),
            total: 0,
        }));

        // Sort
        parsed.sort((a, b) => ascending ? a.price - b.price : b.price - a.price);

        // Calculate running totals
        let runningTotal = 0;
        for (const level of parsed) {
            runningTotal += level.size;
            level.total = runningTotal;
        }

        return parsed.slice(0, 8); // Limit to 8 levels
    };

    const bids = parseLevels(orderBook?.bids, false); // Highest first
    const asks = parseLevels(orderBook?.asks, true);  // Lowest first

    // Calculate max total for depth visualization
    const maxTotal = Math.max(
        bids.length > 0 ? bids[bids.length - 1]?.total || 0 : 0,
        asks.length > 0 ? asks[asks.length - 1]?.total || 0 : 0,
        1
    );

    if (isLoading) {
        return (
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4 h-full">
                <h3 className="text-sm font-semibold text-white mb-4">Order Book</h3>
                <div className="flex items-center justify-center h-48">
                    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4 h-full">
                <h3 className="text-sm font-semibold text-white mb-4">Order Book</h3>
                <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
        );
    }

    return (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4 h-full flex flex-col">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Order Book</h3>
                {/* WebSocket connection indicator */}
                <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    <span className="text-xs text-gray-500">
                        {isConnected ? 'Live' : 'Polling'}
                    </span>
                </div>
            </div>

            {/* Header */}
            <div className="grid grid-cols-3 text-xs text-gray-500 pb-2 border-b border-gray-700/30">
                <span>Price</span>
                <span className="text-right">Size</span>
                <span className="text-right">Total</span>
            </div>

            {/* Asks (Sell orders) - Top */}
            <div className="flex-1 overflow-hidden">
                <div className="space-y-0.5 py-2">
                    {asks.length > 0 ? (
                        [...asks].reverse().map((level, idx) => (
                            <button
                                key={`ask-${idx}`}
                                onClick={() => onPriceClick?.(level.price, 'sell')}
                                className="w-full grid grid-cols-3 text-xs py-1 px-1 rounded hover:bg-gray-700/30 transition-colors relative"
                            >
                                {/* Depth bar */}
                                <div
                                    className="absolute inset-y-0 right-0 bg-red-500/10"
                                    style={{ width: `${(level.total / maxTotal) * 100}%` }}
                                />
                                <span className="text-red-400 relative z-10">{(level.price * 100).toFixed(1)}¢</span>
                                <span className="text-right text-gray-300 relative z-10">{level.size.toFixed(2)}</span>
                                <span className="text-right text-gray-500 relative z-10">{level.total.toFixed(2)}</span>
                            </button>
                        ))
                    ) : (
                        <div className="text-center text-gray-500 text-xs py-4">No asks</div>
                    )}
                </div>

                {/* Spread */}
                <div className="py-2 border-y border-gray-700/30 text-center">
                    <span className="text-xs text-gray-500">
                        Spread: {bids.length > 0 && asks.length > 0
                            ? `${((asks[0]?.price || 0) - (bids[0]?.price || 0)) * 100}¢`
                            : '—'
                        }
                    </span>
                </div>

                {/* Bids (Buy orders) - Bottom */}
                <div className="space-y-0.5 py-2">
                    {bids.length > 0 ? (
                        bids.map((level, idx) => (
                            <button
                                key={`bid-${idx}`}
                                onClick={() => onPriceClick?.(level.price, 'buy')}
                                className="w-full grid grid-cols-3 text-xs py-1 px-1 rounded hover:bg-gray-700/30 transition-colors relative"
                            >
                                {/* Depth bar */}
                                <div
                                    className="absolute inset-y-0 right-0 bg-green-500/10"
                                    style={{ width: `${(level.total / maxTotal) * 100}%` }}
                                />
                                <span className="text-green-400 relative z-10">{(level.price * 100).toFixed(1)}¢</span>
                                <span className="text-right text-gray-300 relative z-10">{level.size.toFixed(2)}</span>
                                <span className="text-right text-gray-500 relative z-10">{level.total.toFixed(2)}</span>
                            </button>
                        ))
                    ) : (
                        <div className="text-center text-gray-500 text-xs py-4">No bids</div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default OrderBook;
