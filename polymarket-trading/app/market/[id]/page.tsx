/**
 * Market Trading Page
 * 
 * Individual market view with detailed information and trading interface.
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { getPolymarketService, type SimplifiedMarket, type Market } from '@/lib/polymarket';
import { LoginButton, WalletInfo, DisconnectButton } from '@/components/wallet';
import { TradingView } from '@/components/trading';

export default function MarketPage() {
    const params = useParams();
    const router = useRouter();
    const { authenticated, ready } = usePrivy();
    const [market, setMarket] = useState<SimplifiedMarket | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const conditionId = params.id as string;

    useEffect(() => {
        async function loadMarket() {
            if (!conditionId) return;

            setIsLoading(true);
            setError(null);

            try {
                const service = getPolymarketService();
                // Fetch market directly by condition ID
                const marketData = await service.getMarket(conditionId);

                if (marketData) {
                    // Convert Market to SimplifiedMarket format for compatibility with TradingView
                    const simplified: SimplifiedMarket = {
                        condition_id: marketData.condition_id,
                        question: marketData.question,
                        tokens: marketData.tokens,
                        active: marketData.active,
                        closed: marketData.closed,
                        end_date_iso: marketData.end_date_iso,
                    };
                    setMarket(simplified);
                } else {
                    setError('Market not found');
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load market');
            } finally {
                setIsLoading(false);
            }
        }

        loadMarket();
    }, [conditionId]);

    const yesToken = market?.tokens?.find(t => t.outcome === 'Yes');
    const noToken = market?.tokens?.find(t => t.outcome === 'No');

    // Format volume
    const formatVolume = (volume?: number): string => {
        if (!volume || volume === 0) return '—';
        if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
        if (volume >= 1_000) return `$${(volume / 1_000).toFixed(0)}K`;
        return `$${volume.toFixed(0)}`;
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                            <span className="text-white font-bold text-lg">P</span>
                        </div>
                        <h1 className="text-xl font-semibold text-white">Market</h1>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <WalletInfo />
                    <DisconnectButton />
                    <LoginButton />
                </div>
            </header>

            {/* Main Content */}
            <main className="px-6 py-8 max-w-6xl mx-auto">
                {!ready || isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : error ? (
                    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-8 text-center">
                        <p className="text-red-400 mb-4">{error}</p>
                        <button
                            onClick={() => router.push('/')}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                        >
                            Back to Markets
                        </button>
                    </div>
                ) : market ? (
                    /* Full Trading Interface */
                    authenticated ? (
                        <TradingView market={market} />
                    ) : (
                        <div className="space-y-6">
                            {/* Market Header for non-authenticated users */}
                            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6">
                                <h2 className="text-2xl font-bold text-white mb-4 leading-snug">
                                    {market.question}
                                </h2>
                                <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                                    {market.end_date_iso && (
                                        <span className="flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            Ends: {new Date(market.end_date_iso).toLocaleDateString()}
                                        </span>
                                    )}
                                    <span className="flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                        </svg>
                                        Volume: {formatVolume(market.volume24hr)}
                                    </span>
                                </div>
                            </div>

                            {/* Price Cards */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-6 text-center">
                                    <p className="text-sm text-gray-400 mb-2">Yes</p>
                                    <p className="text-4xl font-bold text-green-400">
                                        {yesToken?.price ? `${(yesToken.price * 100).toFixed(1)}%` : '—'}
                                    </p>
                                </div>
                                <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-6 text-center">
                                    <p className="text-sm text-gray-400 mb-2">No</p>
                                    <p className="text-4xl font-bold text-red-400">
                                        {noToken?.price ? `${(noToken.price * 100).toFixed(1)}%` : '—'}
                                    </p>
                                </div>
                            </div>

                            {/* Login Prompt */}
                            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-8 text-center">
                                <svg className="w-12 h-12 text-indigo-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                <h3 className="text-lg font-semibold text-white mb-2">Connect to Trade</h3>
                                <p className="text-gray-400 mb-6">Sign in to access the full trading interface with order book, charts, and order placement.</p>
                                <LoginButton />
                            </div>
                        </div>
                    )
                ) : null}
            </main>
        </div>
    );
}
