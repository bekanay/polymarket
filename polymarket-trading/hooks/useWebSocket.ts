/**
 * useWebSocket Hook
 * 
 * React hook for subscribing to real-time Polymarket data via WebSocket.
 * Provides live updates for order book and prices.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getPolymarketWebSocket } from '@/lib/polymarket/websocket';

interface OrderBookLevel {
    price: string;
    size: string;
}

interface UseWebSocketOptions {
    tokenIds: string[];
    onBookUpdate?: (tokenId: string, bids: OrderBookLevel[], asks: OrderBookLevel[]) => void;
    onPriceUpdate?: (tokenId: string, price: string) => void;
    onTradeUpdate?: (tokenId: string, price: string) => void;
}

interface UseWebSocketReturn {
    isConnected: boolean;
    lastPrice: string | null;
    orderBook: {
        bids: OrderBookLevel[];
        asks: OrderBookLevel[];
    } | null;
}

export function useWebSocket({
    tokenIds,
    onBookUpdate,
    onPriceUpdate,
    onTradeUpdate,
}: UseWebSocketOptions): UseWebSocketReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [lastPrice, setLastPrice] = useState<string | null>(null);
    const [orderBook, setOrderBook] = useState<{
        bids: OrderBookLevel[];
        asks: OrderBookLevel[];
    } | null>(null);

    // Refs for callbacks to avoid re-subscriptions
    const onBookUpdateRef = useRef(onBookUpdate);
    const onPriceUpdateRef = useRef(onPriceUpdate);
    const onTradeUpdateRef = useRef(onTradeUpdate);
    const listenerIdRef = useRef<string | null>(null);

    // Update refs when callbacks change
    useEffect(() => {
        onBookUpdateRef.current = onBookUpdate;
        onPriceUpdateRef.current = onPriceUpdate;
        onTradeUpdateRef.current = onTradeUpdate;
    }, [onBookUpdate, onPriceUpdate, onTradeUpdate]);

    // Connect and subscribe on mount
    useEffect(() => {
        if (tokenIds.length === 0) return;

        const ws = getPolymarketWebSocket();

        // Connect first
        ws.connect().catch(console.error);

        // Add listener with callbacks
        const listenerId = ws.addListener({
            tokenIds,
            onBookUpdate: (tokenId, bids, asks) => {
                setOrderBook({ bids, asks });
                onBookUpdateRef.current?.(tokenId, bids, asks);
            },
            onPriceUpdate: (tokenId, price) => {
                setLastPrice(price);
                onPriceUpdateRef.current?.(tokenId, price);
            },
            onTradeUpdate: (tokenId, price) => {
                onTradeUpdateRef.current?.(tokenId, price);
            },
            onConnectionChange: (connected) => {
                setIsConnected(connected);
            },
        });

        listenerIdRef.current = listenerId;

        // Cleanup on unmount
        return () => {
            if (listenerIdRef.current) {
                ws.removeListener(listenerIdRef.current);
                listenerIdRef.current = null;
            }
        };
    }, [tokenIds.join(',')]); // Only re-run if tokenIds change

    return {
        isConnected,
        lastPrice,
        orderBook,
    };
}

export default useWebSocket;
