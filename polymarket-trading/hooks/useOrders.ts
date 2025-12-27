/**
 * useOrders Hook
 * 
 * React hook for order execution operations.
 * Provides functions to place market, limit, and stop orders.
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import {
    createMarketOrder,
    createLimitOrder,
    createStopOrder,
    cancelStopOrder,
    getPendingStopOrders,
    checkStopOrders,
    Side,
    type MarketOrderParams,
    type LimitOrderParams,
    type StopOrderParams,
    type OrderResult,
    type PendingStopOrder,
} from '@/lib/polymarket/orders';

interface UseOrdersOptions {
    onOrderSuccess?: (result: OrderResult) => void;
    onOrderError?: (error: string) => void;
    enableStopOrderMonitoring?: boolean;
    monitoringIntervalMs?: number;
}

interface UseOrdersReturn {
    // Order placement functions
    placeMarketOrder: (params: MarketOrderParams) => Promise<OrderResult>;
    placeLimitOrder: (params: LimitOrderParams) => Promise<OrderResult>;
    placeStopOrder: (params: StopOrderParams) => PendingStopOrder;
    cancelStop: (orderId: string) => boolean;

    // State
    isSubmitting: boolean;
    lastResult: OrderResult | null;
    pendingStopOrders: PendingStopOrder[];

    // Monitoring
    isMonitoring: boolean;
    startMonitoring: () => void;
    stopMonitoring: () => void;
}

export function useOrders(options: UseOrdersOptions = {}): UseOrdersReturn {
    const { authenticated } = usePrivy();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [lastResult, setLastResult] = useState<OrderResult | null>(null);
    const [pendingStopOrders, setPendingStopOrders] = useState<PendingStopOrder[]>([]);
    const [isMonitoring, setIsMonitoring] = useState(false);

    const monitoringIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const {
        onOrderSuccess,
        onOrderError,
        enableStopOrderMonitoring = false,
        monitoringIntervalMs = 5000,
    } = options;

    // Load pending stop orders on mount
    useEffect(() => {
        setPendingStopOrders(getPendingStopOrders());
    }, []);

    // Start stop order monitoring if enabled
    useEffect(() => {
        if (enableStopOrderMonitoring && authenticated && pendingStopOrders.length > 0) {
            startMonitoringInternal();
        }
        return () => stopMonitoringInternal();
    }, [enableStopOrderMonitoring, authenticated, pendingStopOrders.length]);

    const startMonitoringInternal = useCallback(() => {
        if (monitoringIntervalRef.current) return;

        setIsMonitoring(true);
        monitoringIntervalRef.current = setInterval(async () => {
            const { triggered, results } = await checkStopOrders();

            if (triggered.length > 0) {
                // Refresh pending orders
                setPendingStopOrders(getPendingStopOrders());

                // Notify about triggered orders
                results.forEach((result, i) => {
                    if (result.success) {
                        onOrderSuccess?.(result);
                    } else {
                        onOrderError?.(result.error || 'Stop order execution failed');
                    }
                });
            }
        }, monitoringIntervalMs);
    }, [monitoringIntervalMs, onOrderSuccess, onOrderError]);

    const stopMonitoringInternal = useCallback(() => {
        if (monitoringIntervalRef.current) {
            clearInterval(monitoringIntervalRef.current);
            monitoringIntervalRef.current = null;
        }
        setIsMonitoring(false);
    }, []);

    const placeMarketOrder = useCallback(async (params: MarketOrderParams): Promise<OrderResult> => {
        if (!authenticated) {
            const result: OrderResult = { success: false, error: 'Not authenticated' };
            onOrderError?.(result.error!);
            return result;
        }

        setIsSubmitting(true);
        try {
            const result = await createMarketOrder(params);
            setLastResult(result);

            if (result.success) {
                onOrderSuccess?.(result);
            } else {
                onOrderError?.(result.error || 'Order failed');
            }

            return result;
        } finally {
            setIsSubmitting(false);
        }
    }, [authenticated, onOrderSuccess, onOrderError]);

    const placeLimitOrder = useCallback(async (params: LimitOrderParams): Promise<OrderResult> => {
        if (!authenticated) {
            const result: OrderResult = { success: false, error: 'Not authenticated' };
            onOrderError?.(result.error!);
            return result;
        }

        setIsSubmitting(true);
        try {
            const result = await createLimitOrder(params);
            setLastResult(result);

            if (result.success) {
                onOrderSuccess?.(result);
            } else {
                onOrderError?.(result.error || 'Order failed');
            }

            return result;
        } finally {
            setIsSubmitting(false);
        }
    }, [authenticated, onOrderSuccess, onOrderError]);

    const placeStopOrder = useCallback((params: StopOrderParams): PendingStopOrder => {
        const order = createStopOrder(params);
        setPendingStopOrders(getPendingStopOrders());
        return order;
    }, []);

    const cancelStop = useCallback((orderId: string): boolean => {
        const success = cancelStopOrder(orderId);
        if (success) {
            setPendingStopOrders(getPendingStopOrders());
        }
        return success;
    }, []);

    return {
        placeMarketOrder,
        placeLimitOrder,
        placeStopOrder,
        cancelStop,
        isSubmitting,
        lastResult,
        pendingStopOrders,
        isMonitoring,
        startMonitoring: startMonitoringInternal,
        stopMonitoring: stopMonitoringInternal,
    };
}

// Re-export Side for convenience
export { Side };
export type { OrderResult, PendingStopOrder, MarketOrderParams, LimitOrderParams, StopOrderParams };
