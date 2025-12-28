/**
 * UserActivity Component
 * 
 * Displays user's active orders and positions with P&L.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { getPolymarketService, type OpenOrder, type Trade } from '@/lib/polymarket';

interface UserActivityProps {
    tokenId?: string;
    marketId?: string;
}

type ActivityTab = 'orders' | 'positions';

interface Position {
    tokenId: string;
    outcome: string;
    size: number;
    avgPrice: number;
    currentPrice: number;
    pnl: number;
    pnlPercent: number;
}

export function UserActivity({ tokenId, marketId }: UserActivityProps) {
    const { authenticated } = usePrivy();
    const [activeTab, setActiveTab] = useState<ActivityTab>('orders');
    const [orders, setOrders] = useState<OpenOrder[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchUserData = useCallback(async () => {
        if (!authenticated) return;

        setIsLoading(true);
        setError(null);

        try {
            const service = getPolymarketService();

            if (service.isAuthenticated()) {
                // Fetch open orders
                const userOrders = await service.getUserOrders();
                setOrders(userOrders);

                // Fetch trades and calculate positions
                const trades = await service.getUserTrades();
                console.log('User trades:', trades);

                // Calculate positions from trades
                const positionMap = new Map<string, {
                    tokenId: string;
                    totalSize: number;
                    totalCost: number;
                    outcome: string;
                }>();

                for (const trade of trades) {
                    // Use asset_id as the primary key, fallback to tokenID if available
                    const key = trade.asset_id || (trade as unknown as { tokenID?: string }).tokenID;
                    if (!key) continue;

                    const existing = positionMap.get(key) || {
                        tokenId: key,
                        totalSize: 0,
                        totalCost: 0,
                        outcome: trade.outcome || 'Yes',
                    };

                    const size = parseFloat(trade.size || '0');
                    const price = parseFloat(trade.price || '0');
                    const isBuy = trade.side?.toUpperCase() === 'BUY';

                    existing.totalSize += isBuy ? size : -size;
                    existing.totalCost += isBuy ? size * price : -size * price;

                    positionMap.set(key, existing);
                }

                // Convert to Position array
                const calculatedPositions: Position[] = [];
                for (const [key, pos] of positionMap.entries()) {
                    if (pos.totalSize > 0.001) { // Only show positions with meaningful size
                        const avgPrice = pos.totalCost / pos.totalSize;
                        const currentPrice = avgPrice; // Would need to fetch current price for accurate P&L
                        calculatedPositions.push({
                            tokenId: key,
                            outcome: pos.outcome,
                            size: pos.totalSize,
                            avgPrice: avgPrice,
                            currentPrice: currentPrice,
                            pnl: 0, // Would need current price to calculate
                            pnlPercent: 0,
                        });
                    }
                }

                setPositions(calculatedPositions);
                console.log('Calculated positions:', calculatedPositions);
            }
        } catch (err) {
            console.error('Error fetching user data:', err);
            setError(err instanceof Error ? err.message : 'Failed to load user data');
        } finally {
            setIsLoading(false);
        }
    }, [authenticated]);

    useEffect(() => {
        fetchUserData();
        const interval = setInterval(fetchUserData, 10000); // Poll every 10 seconds
        return () => clearInterval(interval);
    }, [fetchUserData]);

    const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);

    const handleCancelOrder = async (orderId: string) => {
        console.log('Canceling order:', orderId);
        setCancelingOrderId(orderId);
        setError(null);

        try {
            const service = getPolymarketService();
            console.log('Service authenticated:', service.isAuthenticated());

            const success = await service.cancelOrder(orderId);
            console.log('Cancel result:', success);

            if (success) {
                // Refresh orders
                await fetchUserData();
            } else {
                setError('Failed to cancel order');
            }
        } catch (err) {
            console.error('Error canceling order:', err);
            setError(err instanceof Error ? err.message : 'Failed to cancel order');
        } finally {
            setCancelingOrderId(null);
        }
    };

    if (!authenticated) {
        return (
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4">
                <h3 className="text-sm font-semibold text-white mb-4">Your Activity</h3>
                <div className="text-center py-8">
                    <p className="text-gray-500 text-sm">Connect wallet to view your activity</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4">
            {/* Tabs */}
            <div className="flex gap-4 mb-4 border-b border-gray-700/30">
                <button
                    onClick={() => setActiveTab('orders')}
                    className={`pb-2 text-sm font-medium transition-colors relative ${activeTab === 'orders'
                        ? 'text-white'
                        : 'text-gray-500 hover:text-gray-300'
                        }`}
                >
                    Open Orders
                    {orders.length > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-indigo-600 rounded-full">
                            {orders.length}
                        </span>
                    )}
                    {activeTab === 'orders' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('positions')}
                    className={`pb-2 text-sm font-medium transition-colors relative ${activeTab === 'positions'
                        ? 'text-white'
                        : 'text-gray-500 hover:text-gray-300'
                        }`}
                >
                    Positions
                    {positions.length > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-indigo-600 rounded-full">
                            {positions.length}
                        </span>
                    )}
                    {activeTab === 'positions' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
                    )}
                </button>
            </div>

            {/* Content */}
            <div className="min-h-[150px]">
                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : error ? (
                    <div className="text-center py-8">
                        <p className="text-red-400 text-sm">{error}</p>
                    </div>
                ) : activeTab === 'orders' ? (
                    /* Orders Tab */
                    orders.length === 0 ? (
                        <div className="text-center py-8">
                            <svg className="w-10 h-10 text-gray-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <p className="text-gray-500 text-sm">No open orders</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {orders.map((order) => (
                                <div
                                    key={order.id}
                                    className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-gray-700/30"
                                >
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${order.side === 'BUY'
                                                ? 'bg-green-900/50 text-green-400'
                                                : 'bg-red-900/50 text-red-400'
                                                }`}>
                                                {order.side}
                                            </span>
                                            <span className="text-sm text-white">{parseFloat(order.original_size).toFixed(2)} shares</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            @ {(parseFloat(order.price) * 100).toFixed(1)}¢
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleCancelOrder(order.id)}
                                        disabled={cancelingOrderId === order.id}
                                        className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {cancelingOrderId === order.id ? (
                                            <span className="flex items-center gap-1">
                                                <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                                                Canceling...
                                            </span>
                                        ) : (
                                            'Cancel'
                                        )}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    /* Positions Tab */
                    positions.length === 0 ? (
                        <div className="text-center py-8">
                            <svg className="w-10 h-10 text-gray-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                            <p className="text-gray-500 text-sm">No positions</p>
                            <p className="text-gray-600 text-xs mt-1">Place a trade to open a position</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {positions.map((position, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-gray-700/30"
                                >
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${position.outcome === 'Yes'
                                                ? 'bg-green-900/50 text-green-400'
                                                : 'bg-red-900/50 text-red-400'
                                                }`}>
                                                {position.outcome}
                                            </span>
                                            <span className="text-sm text-white">{position.size.toFixed(2)} shares</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            Avg: {(position.avgPrice * 100).toFixed(1)}¢ | Now: {(position.currentPrice * 100).toFixed(1)}¢
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-sm font-medium ${position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)}
                                        </p>
                                        <p className={`text-xs ${position.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(1)}%
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>
        </div>
    );
}

export default UserActivity;
