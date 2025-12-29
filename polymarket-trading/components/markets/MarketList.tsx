/**
 * MarketList Component
 * 
 * Displays curated Polymarket markets with filtering and selection.
 * Shows top markets by liquidity, filtered for active markets.
 */

'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useMarkets } from '@/hooks/useMarkets';
import type { SimplifiedMarket } from '@/lib/polymarket';

interface MarketListProps {
    onSelectMarket?: (market: SimplifiedMarket) => void;
    selectedMarketId?: string;
    maxMarkets?: number;
    enableNavigation?: boolean;
}

type MarketCategory = 'all' | 'politics' | 'crypto' | 'sports' | 'entertainment';

export function MarketList({
    onSelectMarket,
    selectedMarketId,
    maxMarkets = 20,
    enableNavigation = false
}: MarketListProps) {
    const router = useRouter();
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

    // Get price display for a market (show as $ price like Polymarket)
    const getMarketPrice = (market: SimplifiedMarket): string => {
        const yesToken = market.tokens?.find(t => t.outcome === 'Yes');
        if (yesToken?.price !== undefined && yesToken.price > 0) {
            const price = yesToken.price;
            // Show as cents (e.g., 45¢ for $0.45, or <1¢ for very low)
            if (price < 0.01) {
                return `<1¢`;
            }
            return `${(price * 100).toFixed(0)}¢`;
        }
        return '—';
    };

    // Format volume for display (e.g., $1.2M, $500K)
    const formatVolume = (volume?: number): string => {
        if (!volume || volume === 0) return '—';
        if (volume >= 1_000_000) {
            return `$${(volume / 1_000_000).toFixed(1)}M`;
        }
        if (volume >= 1_000) {
            return `$${(volume / 1_000).toFixed(0)}K`;
        }
        return `$${volume.toFixed(0)}`;
    };

    // Format price change for display
    const formatPriceChange = (change?: number): { text: string; color: string } => {
        if (change === undefined || change === 0) {
            return { text: '0%', color: 'text-gray-500' };
        }
        const sign = change > 0 ? '+' : '';
        const color = change > 0 ? 'text-green-400' : 'text-red-400';
        return { text: `${sign}${(change * 100).toFixed(1)}%`, color };
    };

    // Handle market selection/navigation
    const handleMarketClick = (market: SimplifiedMarket) => {
        if (enableNavigation) {
            router.push(`/market/${market.condition_id}`);
        }
        onSelectMarket?.(market);
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
                        {filteredMarkets.map((market) => {
                            const priceChange = formatPriceChange(market.priceChange24hr);
                            return (
                                <button
                                    key={market.condition_id}
                                    onClick={() => handleMarketClick(market)}
                                    className={`w-full p-4 text-left hover:bg-gray-700/30 transition-colors group ${selectedMarketId === market.condition_id ? 'bg-indigo-900/20 border-l-2 border-indigo-500' : ''
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white font-medium text-sm leading-snug line-clamp-2 group-hover:text-indigo-300 transition-colors">
                                                {market.question}
                                            </p>
                                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                                                {market.end_date_iso && (
                                                    <span>Ends: {new Date(market.end_date_iso).toLocaleDateString()}</span>
                                                )}
                                                <span className="flex items-center gap-1">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                                    </svg>
                                                    {formatVolume(market.volume24hr)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="text-lg font-bold text-green-400">
                                                {getMarketPrice(market)}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-medium ${priceChange.color}`}>
                                                    {priceChange.text}
                                                </span>
                                                <span className="text-xs text-gray-500">24h</span>
                                            </div>
                                        </div>
                                    </div>
                                    {enableNavigation && (
                                        <div className="flex items-center justify-end mt-2 text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                            View Market →
                                        </div>
                                    )}
                                </button>
                            );
                        })}
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
