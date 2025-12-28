/**
 * TradingView Component
 * 
 * Main trading interface layout integrating all trading sub-components.
 * Now auto-initializes trading service with user's wallet.
 */

'use client';

import { useState } from 'react';
import { OrderBook } from './OrderBook';
import { PriceChart } from './PriceChart';
import { OrderForm } from './OrderForm';
import { UserActivity } from './UserActivity';
import { useTrading } from '@/hooks/useTrading';
import type { SimplifiedMarket } from '@/lib/polymarket';

interface TradingViewProps {
    market: SimplifiedMarket;
}

export function TradingView({ market }: TradingViewProps) {
    const [selectedPrice, setSelectedPrice] = useState<number | undefined>(undefined);
    const [selectedSide, setSelectedSide] = useState<'buy' | 'sell'>('buy');

    // Initialize trading service with wallet
    const { isInitialized, isInitializing, error: tradingError, initializeTrading } = useTrading();

    const yesToken = market.tokens?.find(t => t.outcome === 'Yes');
    const noToken = market.tokens?.find(t => t.outcome === 'No');
    const tokenId = yesToken?.token_id || '';
    const currentPrice = yesToken?.price || 0.5;

    // Handle order book price click
    const handlePriceClick = (price: number, side: 'buy' | 'sell') => {
        setSelectedPrice(price);
        setSelectedSide(side);
    };

    return (
        <div className="space-y-4">
            {/* Trading Initialization Status */}
            {isInitializing && (
                <div className="bg-indigo-900/30 border border-indigo-700/50 rounded-xl p-4 flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-indigo-300">Initializing trading service...</span>
                </div>
            )}

            {tradingError && (
                <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span className="text-red-300">{tradingError}</span>
                        </div>
                        <button
                            onClick={initializeTrading}
                            className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-sm rounded transition-colors"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}

            {isInitialized && !isInitializing && (
                <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-green-400 text-sm">Trading ready</span>
                </div>
            )}

            {/* Market Header */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <h2 className="text-xl font-bold text-white mb-2">{market.question}</h2>
                        <div className="flex items-center gap-4 text-sm">
                            {market.end_date_iso && (
                                <span className="text-gray-400 flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    Ends {new Date(market.end_date_iso).toLocaleDateString()}
                                </span>
                            )}
                            <span className={`px-2 py-0.5 rounded-full text-xs ${market.active ? 'bg-green-900/50 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                                {market.active ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="text-center">
                            <p className="text-xs text-gray-400 mb-1">Yes</p>
                            <p className="text-2xl font-bold text-green-400">
                                {yesToken?.price ? `${(yesToken.price * 100).toFixed(0)}%` : '—'}
                            </p>
                        </div>
                        <div className="text-center">
                            <p className="text-xs text-gray-400 mb-1">No</p>
                            <p className="text-2xl font-bold text-red-400">
                                {noToken?.price ? `${(noToken.price * 100).toFixed(0)}%` : '—'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Trading Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left Column: Order Book */}
                <div className="lg:col-span-1">
                    <OrderBook
                        tokenId={tokenId}
                        onPriceClick={handlePriceClick}
                    />
                </div>

                {/* Right Column: Chart */}
                <div className="lg:col-span-2 min-h-[300px]">
                    <PriceChart
                        tokenId={tokenId}
                        currentPrice={currentPrice}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <OrderForm
                    tokenId={tokenId}
                    noTokenId={noToken?.token_id || ''}
                    currentPrice={currentPrice}
                    initialPrice={selectedPrice}
                    initialSide={selectedSide}
                />

                {/* User Activity */}
                <UserActivity
                    tokenId={tokenId}
                    marketId={market.condition_id}
                />
            </div>
        </div>
    );
}

export default TradingView;
