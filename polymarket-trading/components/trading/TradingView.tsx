/**
 * TradingView Component
 * 
 * Main trading interface layout integrating all trading sub-components.
 */

'use client';

import { useState } from 'react';
import { OrderBook } from './OrderBook';
import { PriceChart } from './PriceChart';
import { OrderForm } from './OrderForm';
import { UserActivity } from './UserActivity';
import type { SimplifiedMarket } from '@/lib/polymarket';

interface TradingViewProps {
    market: SimplifiedMarket;
}

export function TradingView({ market }: TradingViewProps) {
    const [selectedPrice, setSelectedPrice] = useState<number | undefined>(undefined);
    const [selectedSide, setSelectedSide] = useState<'buy' | 'sell'>('buy');

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
