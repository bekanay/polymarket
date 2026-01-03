/**
 * useProxyWallet Hook
 * 
 * React hook for managing proxy wallets in the Polymarket trading interface.
 * Uses Privy's Smart Wallet feature with Safe as the ERC-4337 implementation.
 * All transactions are gas-sponsored via Privy's paymaster.
 */

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
import { ethers } from 'ethers';
import { getProxyWalletService } from '@/lib/wallet/proxyWallet';

// State interface for the hook
interface ProxyWalletState {
    proxyWalletAddress: string | null;
    isLoading: boolean;
    isCreating: boolean;
    error: string | null;
    balance: string | null;
    usdcBalance: string | null;
}

// Interface for proxy wallet creation result  
export interface ProxyWalletResult {
    proxyWalletAddress: string;
    isNew: boolean;
    transactionHash?: string;
}

// Return interface for the hook
interface UseProxyWalletReturn extends ProxyWalletState {
    isDeploying: boolean;
    proxyAddress: string | null;
    createProxyWallet: () => Promise<ProxyWalletResult | null>;
    refreshBalance: () => Promise<void>;
    refreshUsdcBalance: () => Promise<void>;
    hasProxyWallet: boolean;
    smartWalletClient: ReturnType<typeof useSmartWallets>['client'];
}

/**
 * Format balance from wei to human-readable format
 */
function formatBalance(weiBalance: string, decimals: number = 18): string {
    try {
        const value = BigInt(weiBalance);
        const divisor = BigInt(10 ** decimals);
        const wholePart = value / divisor;
        const fractionalPart = value % divisor;

        // Format with 4 decimal places
        const fractionalStr = fractionalPart.toString().padStart(decimals, '0').slice(0, 4);
        return `${wholePart}.${fractionalStr}`;
    } catch {
        return '0.0000';
    }
}

/**
 * Hook to manage proxy wallet creation and state
 * Uses Privy's Smart Wallet (Safe-based ERC-4337 account) with gas sponsorship
 */
export function useProxyWallet(): UseProxyWalletReturn {
    const { authenticated, ready, user } = usePrivy();
    const { wallets } = useWallets();
    const { client } = useSmartWallets();

    const [state, setState] = useState<ProxyWalletState>({
        proxyWalletAddress: null,
        isLoading: true,
        isCreating: false,
        error: null,
        balance: null,
        usdcBalance: null,
    });

    // Get the smart wallet address from Privy user's linked accounts
    const smartWallet = useMemo(() => {
        if (!user?.linkedAccounts) return null;
        return user.linkedAccounts.find(
            (account): account is typeof account & { type: 'smart_wallet'; address: string } =>
                account.type === 'smart_wallet'
        );
    }, [user?.linkedAccounts]);

    // Get the embedded wallet (signer for the smart wallet)
    const embeddedWallet = useMemo(() => {
        return wallets.find(wallet => wallet.walletClientType === 'privy');
    }, [wallets]);

    // Use smart wallet address as the "proxy wallet" address for trading
    const proxyWalletAddress = smartWallet?.address || null;

    // Check wallet status and load balances
    useEffect(() => {
        if (!ready) return;

        const loadWalletState = async () => {
            if (!authenticated) {
                setState({
                    proxyWalletAddress: null,
                    isLoading: false,
                    isCreating: false,
                    error: null,
                    balance: null,
                    usdcBalance: null,
                });
                return;
            }

            // Wait for smart wallet to be available
            if (!smartWallet?.address) {
                // Smart wallet not yet created - this is normal on first login
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    proxyWalletAddress: null,
                    error: null,
                }));
                return;
            }

            try {
                const service = getProxyWalletService();
                const [balance, usdcBalance] = await Promise.all([
                    service.getProxyWalletBalance(smartWallet.address).catch(() => '0'),
                    service.getUSDCBalance(smartWallet.address).catch(() => '0'),
                ]);

                setState({
                    proxyWalletAddress: smartWallet.address,
                    balance: formatBalance(balance, 18),
                    usdcBalance: formatBalance(usdcBalance, 6),
                    isLoading: false,
                    isCreating: false,
                    error: null,
                });
            } catch (error) {
                console.error('Error loading wallet balances:', error);
                setState(prev => ({
                    ...prev,
                    proxyWalletAddress: smartWallet.address,
                    isLoading: false,
                    error: 'Failed to load wallet balances',
                }));
            }
        };

        loadWalletState();
    }, [ready, authenticated, smartWallet?.address]);

    // The smart wallet is automatically created by Privy when the SmartWalletsProvider is used
    // and the user logs in. This function is kept for API compatibility but doesn't
    // need to do manual factory deployment anymore.
    const createProxyWallet = useCallback(async (): Promise<ProxyWalletResult | null> => {
        if (!authenticated) {
            setState(prev => ({ ...prev, error: 'Please connect your wallet first' }));
            return null;
        }

        if (smartWallet?.address) {
            // Smart wallet already exists
            return {
                proxyWalletAddress: smartWallet.address,
                isNew: false,
            };
        }

        // Smart wallet should be auto-created by Privy
        // If it doesn't exist, the user may need to log in again
        setState(prev => ({
            ...prev,
            error: 'Smart wallet not available. Please try logging in again.',
        }));
        return null;
    }, [authenticated, smartWallet?.address]);

    // Refresh native balance
    const refreshBalance = useCallback(async (): Promise<void> => {
        if (!proxyWalletAddress) return;

        try {
            const service = getProxyWalletService();
            const balance = await service.getProxyWalletBalance(proxyWalletAddress);
            setState(prev => ({ ...prev, balance: formatBalance(balance, 18) }));
        } catch (error) {
            console.error('Error refreshing balance:', error);
        }
    }, [proxyWalletAddress]);

    // Refresh USDC balance
    const refreshUsdcBalance = useCallback(async (): Promise<void> => {
        if (!proxyWalletAddress) return;

        try {
            const service = getProxyWalletService();
            const usdcBalance = await service.getUSDCBalance(proxyWalletAddress);
            setState(prev => ({ ...prev, usdcBalance: formatBalance(usdcBalance, 6) }));
        } catch (error) {
            console.error('Error refreshing USDC balance:', error);
        }
    }, [proxyWalletAddress]);

    return {
        ...state,
        proxyWalletAddress,
        isDeploying: state.isCreating,
        proxyAddress: proxyWalletAddress,
        createProxyWallet,
        refreshBalance,
        refreshUsdcBalance,
        hasProxyWallet: proxyWalletAddress !== null,
        smartWalletClient: client, // Expose smart wallet client for gas-sponsored transactions
    };
}

export default useProxyWallet;
