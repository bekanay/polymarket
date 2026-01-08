/**
 * useWallet Hook
 * 
 * React hook for managing user's wallet.
 * Detects login method and uses the correct wallet:
 * - MetaMask login → use MetaMask wallet
 * - Email/Google login → use Privy embedded wallet
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
    isEmbeddedWallet: boolean;
    walletType: 'embedded' | 'external' | null;
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
 * Hook to manage user's wallet state
 * Detects if user logged in with MetaMask or Email/Google and uses the correct wallet
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
        isEmbeddedWallet: false,
        walletType: null,
    });

    // Get the connected wallet address based on how user logged in
    const getWalletInfo = useCallback((): { address: string | null; isEmbedded: boolean; walletType: 'embedded' | 'external' | null } => {
        // Check how the user logged in by looking at linked accounts
        const linkedWallet = user?.linkedAccounts?.find(
            account => account.type === 'wallet'
        );

        // Determine if user logged in with an external wallet (MetaMask, etc.)
        const loggedInWithExternalWallet = linkedWallet && linkedWallet.walletClientType !== 'privy';

        if (loggedInWithExternalWallet) {
            // User logged in with MetaMask or other external wallet
            // Find and return the external wallet, NOT the embedded one
            const externalWallet = wallets.find(w => w.walletClientType !== 'privy');
            if (externalWallet) {
                return {
                    address: externalWallet.address,
                    isEmbedded: false,
                    walletType: 'external' as const
                };
            }
        }

        // User logged in with Email/Google/Twitter - use embedded wallet
        const embeddedWallet = user?.linkedAccounts?.find(
            account => account.type === 'wallet' && account.walletClientType === 'privy'
        );

        if (embeddedWallet && 'address' in embeddedWallet) {
            return {
                address: embeddedWallet.address,
                isEmbedded: true,
                walletType: 'embedded' as const
            };
        }

        // Fallback to first connected wallet from useWallets
        if (wallets.length > 0) {
            const isEmbedded = wallets[0].walletClientType === 'privy';
            return {
                address: wallets[0].address,
                isEmbedded,
                walletType: isEmbedded ? 'embedded' : 'external'
            };
        }

        return { address: null, isEmbedded: false, walletType: null };
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
            const { address, isEmbedded, walletType } = getWalletInfo();

            if (!authenticated || !address) {
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    walletAddress: null,
                    balance: null,
                    usdcBalance: null,
                    isEmbeddedWallet: false,
                    walletType: null,
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
                    isEmbeddedWallet: isEmbedded,
                    walletType,
                });
            } catch (error) {
                console.error('Error checking wallet:', error);
                setState(prev => ({
                    ...prev,
                    walletAddress: address,
                    isLoading: false,
                    error: 'Failed to fetch wallet data',
                    isEmbeddedWallet: isEmbedded,
                    walletType,
                }));
            }
        };

        checkWallet();
    }, [ready, authenticated, getWalletInfo, fetchBalances]);

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
