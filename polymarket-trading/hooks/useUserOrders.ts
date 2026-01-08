/**
 * useUserOrders Hook
 * 
 * Provides access to the authenticated user's open orders.
 * Works directly with EOA wallet (no proxy wallet).
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { BrowserProvider } from 'ethers';
import {
    getPolymarketService,
    type OpenOrder
} from '@/lib/polymarket';
import { useWallet } from './useWallet';

interface UseUserOrdersReturn {
    orders: OpenOrder[];
    isLoading: boolean;
    isInitializing: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    cancelOrder: (orderId: string) => Promise<boolean>;
    cancelAllOrders: () => Promise<boolean>;
}

/**
 * Hook to manage user's orders on Polymarket
 */
export function useUserOrders(): UseUserOrdersReturn {
    const { authenticated, ready } = usePrivy();
    const { wallets } = useWallets();
    const { walletAddress } = useWallet();

    const [orders, setOrders] = useState<OpenOrder[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isInitializing, setIsInitializing] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isServiceReady, setIsServiceReady] = useState(false);

    // Get the embedded wallet for signing
    const embeddedWallet = wallets.find(
        wallet => wallet.walletClientType === 'privy'
    );

    // Initialize the Polymarket service with signer
    useEffect(() => {
        const initializeService = async () => {
            if (!authenticated || !walletAddress || !embeddedWallet) {
                setIsInitializing(false);
                return;
            }

            try {
                const ethereumProvider = await embeddedWallet.getEthereumProvider();
                const provider = new BrowserProvider(ethereumProvider);
                const signer = await provider.getSigner();

                // The signer needs to be converted to ethers v5 format for CLOB client
                // For now, we'll use read-only mode
                // TODO: Properly convert ethers v6 signer to v5 format

                const service = getPolymarketService();
                service.initializeReadOnly();
                setIsServiceReady(true);
            } catch (err) {
                console.error('Failed to initialize Polymarket service:', err);
                setError('Failed to initialize trading service');
            } finally {
                setIsInitializing(false);
            }
        };

        initializeService();
    }, [authenticated, walletAddress, embeddedWallet]);

    // Fetch orders
    const fetchOrders = useCallback(async () => {
        if (!isServiceReady) return;

        setIsLoading(true);
        setError(null);

        try {
            const service = getPolymarketService();
            const userOrders = await service.getUserOrders();
            setOrders(userOrders);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch orders');
        } finally {
            setIsLoading(false);
        }
    }, [isServiceReady]);

    // Refresh orders
    const refresh = useCallback(async () => {
        await fetchOrders();
    }, [fetchOrders]);

    // Cancel a single order
    const cancelOrder = useCallback(async (orderId: string): Promise<boolean> => {
        if (!isServiceReady) return false;

        try {
            const service = getPolymarketService();
            const success = await service.cancelOrder(orderId);
            if (success) {
                await refresh();
            }
            return success;
        } catch (err) {
            console.error('Failed to cancel order:', err);
            return false;
        }
    }, [isServiceReady, refresh]);

    // Cancel all orders
    const cancelAllOrders = useCallback(async (): Promise<boolean> => {
        if (!isServiceReady) return false;

        try {
            const service = getPolymarketService();
            const success = await service.cancelAllOrders();
            if (success) {
                setOrders([]);
            }
            return success;
        } catch (err) {
            console.error('Failed to cancel all orders:', err);
            return false;
        }
    }, [isServiceReady]);

    // Fetch orders when service is ready
    useEffect(() => {
        if (isServiceReady) {
            fetchOrders();
        }
    }, [isServiceReady, fetchOrders]);

    return {
        orders,
        isLoading,
        isInitializing,
        error,
        refresh,
        cancelOrder,
        cancelAllOrders,
    };
}

export default useUserOrders;
