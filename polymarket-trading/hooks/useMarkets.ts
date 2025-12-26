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
    const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
    const [hasMore, setHasMore] = useState(true);

    // Fetch initial markets
    const fetchMarkets = useCallback(async (cursor?: string, append: boolean = false) => {
        setIsLoading(true);
        setError(null);

        try {
            const service = getPolymarketService();
            const response = await service.getMarkets(cursor);

            if (append) {
                setMarkets(prev => [...prev, ...response.markets]);
            } else {
                setMarkets(response.markets);
            }

            setNextCursor(response.next_cursor);
            setHasMore(!!response.next_cursor);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch markets');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Load more markets
    const loadMore = useCallback(async () => {
        if (!hasMore || isLoading) return;
        await fetchMarkets(nextCursor, true);
    }, [hasMore, isLoading, nextCursor, fetchMarkets]);

    // Refresh markets
    const refresh = useCallback(async () => {
        setNextCursor(undefined);
        await fetchMarkets(undefined, false);
    }, [fetchMarkets]);

    // Fetch on mount
    useEffect(() => {
        fetchMarkets();
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
