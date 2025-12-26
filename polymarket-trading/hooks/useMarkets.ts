/**
 * useMarkets Hook
 * 
 * Provides access to Polymarket markets with pagination and caching.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    getPolymarketService,
    type SimplifiedMarket
} from '@/lib/polymarket';

const MARKETS_PER_PAGE = 100;

interface UseMarketsReturn {
    markets: SimplifiedMarket[];
    isLoading: boolean;
    error: string | null;
    hasMore: boolean;
    loadMore: () => Promise<void>;
    refresh: () => Promise<void>;
}

/**
 * Hook to fetch and manage Polymarket markets
 */
export function useMarkets(): UseMarketsReturn {
    const [markets, setMarkets] = useState<SimplifiedMarket[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    // Fetch markets
    const fetchMarkets = useCallback(async (currentOffset: number = 0, append: boolean = false) => {
        setIsLoading(true);
        setError(null);

        try {
            const service = getPolymarketService();
            const response = await service.getMarkets(MARKETS_PER_PAGE, currentOffset);

            if (append) {
                setMarkets(prev => [...prev, ...response.markets]);
            } else {
                setMarkets(response.markets);
            }

            setHasMore(!!response.next_cursor);
            if (response.next_cursor) {
                setOffset(parseInt(response.next_cursor, 10));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch markets');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Load more markets
    const loadMore = useCallback(async () => {
        if (!hasMore || isLoading) return;
        await fetchMarkets(offset, true);
    }, [hasMore, isLoading, offset, fetchMarkets]);

    // Refresh markets
    const refresh = useCallback(async () => {
        setOffset(0);
        await fetchMarkets(0, false);
    }, [fetchMarkets]);

    // Fetch on mount
    useEffect(() => {
        fetchMarkets(0);
    }, [fetchMarkets]);

    return {
        markets,
        isLoading,
        error,
        hasMore,
        loadMore,
        refresh,
    };
}

export default useMarkets;

