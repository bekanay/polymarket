/**
 * useWallet Hook
 * 
 * React hook for managing EOA wallet (embedded wallet from Privy).
 * No proxy wallet - uses the embedded wallet directly for trading.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';

// Polygon mainnet USDC (Bridged USDC.e - used by Polymarket)
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_ABI = ['function balanceOf(address) view returns (uint256)'];

// State interface for the hook
interface WalletState {
    walletAddress: string | null;
    isLoading: boolean;
    error: string | null;
    balance: string | null;
    usdcBalance: string | null;
}

// Return interface for the hook
interface UseWalletReturn extends WalletState {
    refreshBalance: () => Promise<void>;
    refreshUsdcBalance: () => Promise<void>;
    hasWallet: boolean;
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
 * Hook to manage EOA wallet state
 * Uses Privy's embedded wallet directly for trading
 */
export function useWallet(): UseWalletReturn {
    const { authenticated, ready, user } = usePrivy();
    const { wallets } = useWallets();

    const [state, setState] = useState<WalletState>({
        walletAddress: null,
        isLoading: true,
        error: null,
        balance: null,
        usdcBalance: null,
    });

    // Get the connected wallet address (prioritize embedded wallet)
    const getWalletAddress = useCallback((): string | null => {
        // First, try to get embedded wallet from user
        const embeddedWallet = user?.linkedAccounts?.find(
            account => account.type === 'wallet' && account.walletClientType === 'privy'
        );

        if (embeddedWallet && 'address' in embeddedWallet) {
            return embeddedWallet.address;
        }

        // Fallback to first connected wallet from useWallets
        if (wallets.length > 0) {
            return wallets[0].address;
        }

        return null;
    }, [user, wallets]);

    // Fetch balances for wallet
    const fetchBalances = useCallback(async (address: string) => {
        try {
            const provider = new ethers.JsonRpcProvider(
                process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com'
            );

            const [nativeBalance, usdcContract] = await Promise.all([
                provider.getBalance(address),
                new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider),
            ]);

            const usdcBalance = await usdcContract.balanceOf(address);

            return {
                balance: formatBalance(nativeBalance.toString(), 18),
                usdcBalance: formatBalance(usdcBalance.toString(), 6),
            };
        } catch (error) {
            console.error('Error fetching balances:', error);
            return { balance: '0.0000', usdcBalance: '0.0000' };
        }
    }, []);

    // Check wallet on mount
    useEffect(() => {
        if (!ready) return;

        const checkWallet = async () => {
            const address = getWalletAddress();

            if (!authenticated || !address) {
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    walletAddress: null,
                    balance: null,
                    usdcBalance: null,
                }));
                return;
            }

            try {
                const balances = await fetchBalances(address);

                setState({
                    walletAddress: address,
                    balance: balances.balance,
                    usdcBalance: balances.usdcBalance,
                    isLoading: false,
                    error: null,
                });
            } catch (error) {
                console.error('Error checking wallet:', error);
                setState(prev => ({
                    ...prev,
                    walletAddress: address,
                    isLoading: false,
                    error: 'Failed to fetch wallet data',
                }));
            }
        };

        checkWallet();
    }, [ready, authenticated, getWalletAddress, fetchBalances]);

    // Refresh native balance
    const refreshBalance = useCallback(async (): Promise<void> => {
        if (!state.walletAddress) return;

        try {
            const provider = new ethers.JsonRpcProvider(
                process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com'
            );
            const balance = await provider.getBalance(state.walletAddress);
            setState(prev => ({ ...prev, balance: formatBalance(balance.toString(), 18) }));
        } catch (error) {
            console.error('Error refreshing balance:', error);
        }
    }, [state.walletAddress]);

    // Refresh USDC balance
    const refreshUsdcBalance = useCallback(async (): Promise<void> => {
        if (!state.walletAddress) return;

        try {
            const provider = new ethers.JsonRpcProvider(
                process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com'
            );
            const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
            const usdcBalance = await usdcContract.balanceOf(state.walletAddress);
            setState(prev => ({ ...prev, usdcBalance: formatBalance(usdcBalance.toString(), 6) }));
        } catch (error) {
            console.error('Error refreshing USDC balance:', error);
        }
    }, [state.walletAddress]);

    return {
        ...state,
        refreshBalance,
        refreshUsdcBalance,
        hasWallet: state.walletAddress !== null,
    };
}

export default useWallet;
