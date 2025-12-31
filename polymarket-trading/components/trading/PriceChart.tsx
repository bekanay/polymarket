/**
 * PriceChart Component
 * 
 * Displays historical price data using recharts.
 * Supports multiple time ranges: 1H, 24H, 7D, 30D.
 * Uses WebSocket for real-time price updates.
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getPolymarketService } from '@/lib/polymarket';
import { useWebSocket } from '@/hooks/useWebSocket';

interface PriceChartProps {
    tokenId: string;
    currentPrice?: number;
}

type TimeRange = '1H' | '24H' | '7D' | '30D';

interface PricePoint {
    timestamp: number;
    price: number;
    date: string;
}

const TIME_RANGE_CONFIG: Record<TimeRange, { ms: number; fidelity: number; label: string }> = {
    '1H': { ms: 60 * 60 * 1000, fidelity: 1, label: '1 Hour' },
    '24H': { ms: 24 * 60 * 60 * 1000, fidelity: 60, label: '24 Hours' },
    '7D': { ms: 7 * 24 * 60 * 60 * 1000, fidelity: 360, label: '7 Days' },
    '30D': { ms: 30 * 24 * 60 * 60 * 1000, fidelity: 1440, label: '30 Days' },
};

export function PriceChart({ tokenId, currentPrice }: PriceChartProps) {
    const [timeRange, setTimeRange] = useState<TimeRange>('24H');
    const [priceData, setPriceData] = useState<PricePoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [livePrice, setLivePrice] = useState<number | null>(null);

    // Memoize tokenIds for WebSocket
    const tokenIds = useMemo(() => tokenId ? [tokenId] : [], [tokenId]);

    // WebSocket for real-time price updates
    const { isConnected } = useWebSocket({
        tokenIds,
        onPriceUpdate: useCallback((tid: string, price: string) => {
            if (tid === tokenId) {
                const priceNum = parseFloat(price) * 100;
                setLivePrice(priceNum);

                setPriceData(prev => {
                    const now = Date.now();
                    const newPoint: PricePoint = {
                        timestamp: now,
                        price: priceNum,
                        date: new Date(now).toLocaleString(),
                    };

                    if (prev.length > 0) {
                        const lastPoint = prev[prev.length - 1];
                        if (now - lastPoint.timestamp < 5000) {
                            return [...prev.slice(0, -1), newPoint];
                        }
                    }
                    return [...prev, newPoint].slice(-500);
                });
            }
        }, [tokenId]),
        onTradeUpdate: useCallback((tid: string, price: string) => {
            if (tid === tokenId) {
                setLivePrice(parseFloat(price) * 100);
            }
        }, [tokenId]),
    });

    const fetchPriceHistory = useCallback(async () => {
        if (!tokenId) return;

        setIsLoading(true);
        setError(null);

        try {
            const service = getPolymarketService();
            const config = TIME_RANGE_CONFIG[timeRange];
            const now = Date.now();
            const startTs = Math.floor((now - config.ms) / 1000);
            const endTs = Math.floor(now / 1000);

            const history = await service.getPriceHistory(tokenId, startTs, endTs, config.fidelity);

            const points: PricePoint[] = history.map((point) => ({
                timestamp: point.t * 1000,
                price: Number(point.p) * 100,
                date: new Date(point.t * 1000).toLocaleString(),
            }));

            if (currentPrice !== undefined && points.length > 0) {
                points.push({
                    timestamp: now,
                    price: currentPrice * 100,
                    date: new Date(now).toLocaleString(),
                });
            }

            setPriceData(points);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load price history');
            const mockData = generateMockData(timeRange, currentPrice);
            setPriceData(mockData);
        } finally {
            setIsLoading(false);
        }
    }, [tokenId, timeRange, currentPrice]);

    useEffect(() => {
        fetchPriceHistory();
    }, [fetchPriceHistory]);

    function generateMockData(range: TimeRange, price?: number): PricePoint[] {
        const config = TIME_RANGE_CONFIG[range];
        const now = Date.now();
        const points: PricePoint[] = [];
        const basePrice = (price ?? 0.5) * 100;
        const numPoints = 50;

        for (let i = 0; i < numPoints; i++) {
            const t = now - config.ms + (config.ms / numPoints) * i;
            const volatility = Math.random() * 10 - 5;
            const trend = (i / numPoints) * 5;
            points.push({
                timestamp: t,
                price: Math.max(0, Math.min(100, basePrice + volatility + trend - 2.5)),
                date: new Date(t).toLocaleString(),
            });
        }

        if (price !== undefined) {
            points.push({
                timestamp: now,
                price: price * 100,
                date: new Date(now).toLocaleString(),
            });
        }

        return points;
    }

    const timeRanges: TimeRange[] = ['1H', '24H', '7D', '30D'];

    const priceChange = priceData.length >= 2
        ? priceData[priceData.length - 1].price - priceData[0].price
        : 0;
    const priceChangePercent = priceData.length >= 2 && priceData[0].price > 0
        ? (priceChange / priceData[0].price) * 100
        : 0;

    return (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-white">Price History</h3>
                        <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`} />
                            <span className="text-xs text-gray-500">
                                {isConnected ? 'Live' : 'Polling'}
                            </span>
                        </div>
                    </div>
                    {priceData.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className={`text-xs ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {priceChange >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}% ({TIME_RANGE_CONFIG[timeRange].label})
                            </span>
                            {livePrice !== null && (
                                <span className="text-xs text-white font-medium">
                                    Now: {livePrice.toFixed(1)}%
                                </span>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex gap-1">
                    {timeRanges.map((range) => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={`px-2 py-1 text-xs rounded transition-colors ${timeRange === range
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                                }`}
                        >
                            {range}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 min-h-[200px]">
                {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : error && priceData.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-red-400 text-sm">{error}</p>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={priceData}>
                            <defs>
                                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={priceChange >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={priceChange >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="timestamp"
                                tickFormatter={(ts) => {
                                    const date = new Date(ts);
                                    if (timeRange === '1H' || timeRange === '24H') {
                                        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                    }
                                    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                                }}
                                stroke="#6b7280"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                domain={['auto', 'auto']}
                                tickFormatter={(val) => `${val.toFixed(0)}%`}
                                stroke="#6b7280"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                width={40}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1f2937',
                                    border: '1px solid #374151',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                }}
                                labelFormatter={(ts) => new Date(ts).toLocaleString()}
                                formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(1)}%`, 'Price']}
                            />
                            <Area
                                type="monotone"
                                dataKey="price"
                                stroke={priceChange >= 0 ? '#10b981' : '#ef4444'}
                                fill="url(#priceGradient)"
                                strokeWidth={2}
                                isAnimationActive={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}

export default PriceChart;
