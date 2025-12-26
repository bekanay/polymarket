/**
 * useOrderBook Hook
 * 
 * Provides real-time order book data for a specific token.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    getPolymarketService,
    type OrderBookSummary
} from '@/lib/polymarket';

interface OrderBookEntry {
    price: number;
    size: number;
}

interface UseOrderBookReturn {
    orderBook: OrderBookSummary | null;
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
    midpoint: number | null;
    spread: number | null;
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

/**
 * Parse order book entries from strings to numbers
 */
function parseOrderBookEntries(entries: { price: string; size: string }[]): OrderBookEntry[] {
    return entries.map(entry => ({
        price: parseFloat(entry.price),
        size: parseFloat(entry.size),
    }));
}

/**
 * Hook to fetch order book data for a token
 * @param tokenId - The token ID to get order book for
 * @param refreshInterval - Poll interval in ms (0 to disable)
 */
export function useOrderBook(
    tokenId: string | null,
    refreshInterval: number = 5000
): UseOrderBookReturn {
    const [orderBook, setOrderBook] = useState<OrderBookSummary | null>(null);
    const [bids, setBids] = useState<OrderBookEntry[]>([]);
    const [asks, setAsks] = useState<OrderBookEntry[]>([]);
    const [midpoint, setMidpoint] = useState<number | null>(null);
    const [spread, setSpread] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch order book
    const fetchOrderBook = useCallback(async () => {
        if (!tokenId) {
            setOrderBook(null);
            setBids([]);
            setAsks([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const service = getPolymarketService();
            const book = await service.getOrderBook(tokenId);

            if (book) {
                setOrderBook(book);

                const parsedBids = parseOrderBookEntries(book.bids || []);
                const parsedAsks = parseOrderBookEntries(book.asks || []);

                setBids(parsedBids);
                setAsks(parsedAsks);

                // Calculate midpoint
                if (parsedBids.length > 0 && parsedAsks.length > 0) {
                    const bestBid = parsedBids[0].price;
                    const bestAsk = parsedAsks[0].price;
                    setMidpoint((bestBid + bestAsk) / 2);
                    setSpread(bestAsk - bestBid);
                } else {
                    setMidpoint(null);
                    setSpread(null);
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch order book');
        } finally {
            setIsLoading(false);
        }
    }, [tokenId]);

    // Refresh function
    const refresh = useCallback(async () => {
        await fetchOrderBook();
    }, [fetchOrderBook]);

    // Fetch on mount and when tokenId changes
    useEffect(() => {
        fetchOrderBook();
    }, [fetchOrderBook]);

    // Auto-refresh at interval
    useEffect(() => {
        if (refreshInterval <= 0 || !tokenId) return;

        const interval = setInterval(() => {
            fetchOrderBook();
        }, refreshInterval);

        return () => clearInterval(interval);
    }, [refreshInterval, tokenId, fetchOrderBook]);

    return {
        orderBook,
        bids,
        asks,
        midpoint,
        spread,
        isLoading,
        error,
        refresh,
    };
}

export default useOrderBook;
