/**
 * useWebSocket Hook
 * 
 * React hook for subscribing to real-time Polymarket data via WebSocket.
 * Provides live updates for order book and prices.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    getPolymarketWebSocket,
    type OnBookUpdate,
    type OnPriceUpdate,
    type OnTradeUpdate,
} from '@/lib/polymarket/websocket';

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

    // Update refs when callbacks change
    useEffect(() => {
        onBookUpdateRef.current = onBookUpdate;
        onPriceUpdateRef.current = onPriceUpdate;
        onTradeUpdateRef.current = onTradeUpdate;
    }, [onBookUpdate, onPriceUpdate, onTradeUpdate]);

    // Handle book updates
    const handleBookUpdate: OnBookUpdate = useCallback((tokenId, bids, asks) => {
        // Only update if this token is in our subscription
        if (tokenIds.includes(tokenId)) {
            setOrderBook({ bids, asks });
            onBookUpdateRef.current?.(tokenId, bids, asks);
        }
    }, [tokenIds]);

    // Handle price updates
    const handlePriceUpdate: OnPriceUpdate = useCallback((tokenId, price) => {
        if (tokenIds.includes(tokenId)) {
            setLastPrice(price);
            onPriceUpdateRef.current?.(tokenId, price);
        }
    }, [tokenIds]);

    // Handle trade updates
    const handleTradeUpdate: OnTradeUpdate = useCallback((tokenId, price) => {
        if (tokenIds.includes(tokenId)) {
            onTradeUpdateRef.current?.(tokenId, price);
        }
    }, [tokenIds]);

    // Connect and subscribe on mount
    useEffect(() => {
        if (tokenIds.length === 0) return;

        const ws = getPolymarketWebSocket();

        // Set callbacks
        ws.setCallbacks({
            onBookUpdate: handleBookUpdate,
            onPriceUpdate: handlePriceUpdate,
            onTradeUpdate: handleTradeUpdate,
            onConnectionChange: setIsConnected,
        });

        // Connect and subscribe
        ws.connect()
            .then(() => {
                ws.subscribe(tokenIds);
            })
            .catch((err) => {
                console.error('[useWebSocket] Connection failed:', err);
            });

        // Cleanup on unmount
        return () => {
            ws.unsubscribe(tokenIds);
        };
    }, [tokenIds, handleBookUpdate, handlePriceUpdate, handleTradeUpdate]);

    return {
        isConnected,
        lastPrice,
        orderBook,
    };
}

export default useWebSocket;
