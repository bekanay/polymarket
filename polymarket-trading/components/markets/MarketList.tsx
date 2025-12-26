/**
 * MarketList Component
 * 
 * Displays curated Polymarket markets with filtering and selection.
 * Shows top markets by liquidity, filtered for active markets.
 */

'use client';

import { useState, useMemo } from 'react';
import { useMarkets } from '@/hooks/useMarkets';
import type { SimplifiedMarket } from '@/lib/polymarket';

interface MarketListProps {
    onSelectMarket?: (market: SimplifiedMarket) => void;
    selectedMarketId?: string;
    maxMarkets?: number;
}

type MarketCategory = 'all' | 'politics' | 'crypto' | 'sports' | 'entertainment';

export function MarketList({
    onSelectMarket,
    selectedMarketId,
    maxMarkets = 20
}: MarketListProps) {
    const { markets, isLoading, error, loadMore, hasMore, refresh } = useMarkets();
    const [category, setCategory] = useState<MarketCategory>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Filter and curate markets
    const filteredMarkets = useMemo(() => {
        let filtered = markets.filter(market => {
            // Only show active, non-closed markets
            if (!market.active || market.closed) return false;

            // Filter by search query
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                if (!market.question.toLowerCase().includes(query)) {
                    return false;
                }
            }

            // Filter by category (based on question keywords)
            if (category !== 'all') {
                const question = market.question.toLowerCase();
                const categoryKeywords: Record<MarketCategory, string[]> = {
                    all: [],
                    politics: ['president', 'election', 'trump', 'biden', 'congress', 'senate', 'vote', 'political', 'democrat', 'republican'],
                    crypto: ['bitcoin', 'ethereum', 'crypto', 'btc', 'eth', 'token', 'blockchain', 'defi', 'nft'],
                    sports: ['nfl', 'nba', 'football', 'basketball', 'soccer', 'tennis', 'sports', 'championship', 'super bowl', 'world cup'],
                    entertainment: ['movie', 'oscar', 'grammy', 'celebrity', 'show', 'tv', 'film', 'music', 'award'],
                };

                const keywords = categoryKeywords[category];
                if (!keywords.some(kw => question.includes(kw))) {
                    return false;
                }
            }

            return true;
        });

        // Limit to max markets
        return filtered.slice(0, maxMarkets);
    }, [markets, category, searchQuery, maxMarkets]);

    // Get price display for a market
    const getMarketPrice = (market: SimplifiedMarket): string => {
        const yesToken = market.tokens?.find(t => t.outcome === 'Yes');
        if (yesToken?.price !== undefined) {
            return `${(yesToken.price * 100).toFixed(0)}%`;
        }
        return '—';
    };

    // Categories for filter buttons
    const categories: { id: MarketCategory; label: string; emoji: string }[] = [
        { id: 'all', label: 'All', emoji: '🌐' },
        { id: 'politics', label: 'Politics', emoji: '🏛️' },
        { id: 'crypto', label: 'Crypto', emoji: '₿' },
        { id: 'sports', label: 'Sports', emoji: '⚽' },
        { id: 'entertainment', label: 'Entertainment', emoji: '🎬' },
    ];

    if (error) {
        return (
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6">
                <div className="text-center">
                    <p className="text-red-400 mb-4">{error}</p>
                    <button
                        onClick={refresh}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-700/50">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white">Markets</h2>
                    <button
                        onClick={refresh}
                        disabled={isLoading}
                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
                        title="Refresh markets"
                    >
                        <svg
                            className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                {/* Search */}
                <div className="relative mb-4">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search markets..."
                        className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg px-4 py-2 pl-10 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>

                {/* Category Filters */}
                <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setCategory(cat.id)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${category === cat.id
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-white'
                                }`}
                        >
                            <span>{cat.emoji}</span>
                            <span>{cat.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Market List */}
            <div className="max-h-[500px] overflow-y-auto">
                {isLoading && markets.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : filteredMarkets.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        No markets found matching your criteria
                    </div>
                ) : (
                    <div className="divide-y divide-gray-700/30">
                        {filteredMarkets.map((market) => (
                            <button
                                key={market.condition_id}
                                onClick={() => onSelectMarket?.(market)}
                                className={`w-full p-4 text-left hover:bg-gray-700/30 transition-colors ${selectedMarketId === market.condition_id ? 'bg-indigo-900/20 border-l-2 border-indigo-500' : ''
                                    }`}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-medium text-sm leading-snug line-clamp-2">
                                            {market.question}
                                        </p>
                                        {market.end_date_iso && (
                                            <p className="text-xs text-gray-500 mt-1">
                                                Ends: {new Date(market.end_date_iso).toLocaleDateString()}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-lg font-bold text-green-400">
                                            {getMarketPrice(market)}
                                        </span>
                                        <span className="text-xs text-gray-500">Yes</span>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Load More */}
            {hasMore && !isLoading && filteredMarkets.length >= maxMarkets && (
                <div className="p-4 border-t border-gray-700/30">
                    <button
                        onClick={loadMore}
                        className="w-full py-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                        Load more markets...
                    </button>
                </div>
            )}

            {/* Loading indicator at bottom */}
            {isLoading && markets.length > 0 && (
                <div className="p-4 border-t border-gray-700/30 flex justify-center">
                    <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
            )}
        </div>
    );
}

export default MarketList;
