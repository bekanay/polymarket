/**
 * useProxyWallet Hook
 * 
 * React hook for managing proxy wallets in the Polymarket trading interface.
 * Integrates with Privy for authentication and Gnosis Safe for wallet management.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ethers, BrowserProvider } from 'ethers';
import {
    ProxyWalletService,
    ProxyWalletResult,
    getProxyWalletService
} from '@/lib/wallet/proxyWallet';

// State interface for the hook
interface ProxyWalletState {
    proxyWalletAddress: string | null;
    isLoading: boolean;
    isCreating: boolean;
    error: string | null;
    balance: string | null;
    usdcBalance: string | null;
}

// Return interface for the hook
interface UseProxyWalletReturn extends ProxyWalletState {
    createProxyWallet: () => Promise<ProxyWalletResult | null>;
    refreshBalance: () => Promise<void>;
    refreshUsdcBalance: () => Promise<void>;
    hasProxyWallet: boolean;
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
 */
export function useProxyWallet(): UseProxyWalletReturn {
    const { authenticated, ready, user } = usePrivy();
    const { wallets } = useWallets();

    const [state, setState] = useState<ProxyWalletState>({
        proxyWalletAddress: null,
        isLoading: true,
        isCreating: false,
        error: null,
        balance: null,
        usdcBalance: null,
    });

    // Get the connected wallet address
    const getConnectedWalletAddress = useCallback((): string | null => {
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

    // Get ethers signer from Privy wallet
    const getEthersSigner = useCallback(async (): Promise<ethers.Signer | null> => {
        if (wallets.length === 0) return null;

        try {
            const wallet = wallets[0];
            const ethereumProvider = await wallet.getEthereumProvider();
            const provider = new BrowserProvider(ethereumProvider);
            return provider.getSigner();
        } catch (error) {
            console.error('Failed to get signer:', error);
            return null;
        }
    }, [wallets]);

    // Check for existing proxy wallet on mount
    useEffect(() => {
        if (!ready) return;

        const checkExistingWallet = async () => {
            const userAddress = getConnectedWalletAddress();

            if (!authenticated || !userAddress) {
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    proxyWalletAddress: null,
                    balance: null,
                    usdcBalance: null,
                }));
                return;
            }

            try {
                const service = getProxyWalletService();

                // Check localStorage first, then try to recover from chain
                let existingWallet = service.getProxyWallet(userAddress);

                if (!existingWallet) {
                    // Try to recover from on-chain (wallet may exist but not in localStorage)
                    console.log('Checking for existing on-chain proxy wallet...');
                    existingWallet = await service.checkAndRecoverWallet(userAddress);
                }

                if (existingWallet) {
                    // Fetch balances for existing wallet
                    const [balance, usdcBalance] = await Promise.all([
                        service.getProxyWalletBalance(existingWallet).catch(() => '0'),
                        service.getUSDCBalance(existingWallet).catch(() => '0'),
                    ]);

                    setState(prev => ({
                        ...prev,
                        proxyWalletAddress: existingWallet,
                        balance: formatBalance(balance, 18),
                        usdcBalance: formatBalance(usdcBalance, 6),
                        isLoading: false,
                    }));
                } else {
                    setState(prev => ({
                        ...prev,
                        isLoading: false,
                        proxyWalletAddress: null,
                    }));
                }
            } catch (error) {
                console.error('Error checking existing wallet:', error);
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: 'Failed to check existing wallet',
                }));
            }
        };

        checkExistingWallet();
    }, [ready, authenticated, getConnectedWalletAddress]);

    // Create proxy wallet
    const createProxyWallet = useCallback(async (): Promise<ProxyWalletResult | null> => {
        const userAddress = getConnectedWalletAddress();

        if (!authenticated || !userAddress) {
            setState(prev => ({ ...prev, error: 'Please connect your wallet first' }));
            return null;
        }

        setState(prev => ({ ...prev, isCreating: true, error: null }));

        try {
            const signer = await getEthersSigner();
            if (!signer) {
                throw new Error('Could not get wallet signer');
            }

            const service = getProxyWalletService();
            await service.connectSigner(signer);

            const result = await service.createProxyWallet(
                userAddress,
                (txHash) => {
                    console.log('Proxy wallet deployment transaction:', txHash);
                }
            );

            if (result.proxyWalletAddress) {
                // Fetch initial balances
                const [balance, usdcBalance] = await Promise.all([
                    service.getProxyWalletBalance(result.proxyWalletAddress).catch(() => '0'),
                    service.getUSDCBalance(result.proxyWalletAddress).catch(() => '0'),
                ]);

                setState(prev => ({
                    ...prev,
                    proxyWalletAddress: result.proxyWalletAddress,
                    balance: formatBalance(balance, 18),
                    usdcBalance: formatBalance(usdcBalance, 6),
                    isCreating: false,
                }));

                return result;
            }

            throw new Error('Failed to create proxy wallet');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setState(prev => ({
                ...prev,
                isCreating: false,
                error: `Failed to create proxy wallet: ${errorMessage}`
            }));
            return null;
        }
    }, [authenticated, getConnectedWalletAddress, getEthersSigner]);

    // Refresh native balance
    const refreshBalance = useCallback(async (): Promise<void> => {
        if (!state.proxyWalletAddress) return;

        try {
            const service = getProxyWalletService();
            const balance = await service.getProxyWalletBalance(state.proxyWalletAddress);
            setState(prev => ({ ...prev, balance: formatBalance(balance, 18) }));
        } catch (error) {
            console.error('Error refreshing balance:', error);
        }
    }, [state.proxyWalletAddress]);

    // Refresh USDC balance
    const refreshUsdcBalance = useCallback(async (): Promise<void> => {
        if (!state.proxyWalletAddress) return;

        try {
            const service = getProxyWalletService();
            const usdcBalance = await service.getUSDCBalance(state.proxyWalletAddress);
            setState(prev => ({ ...prev, usdcBalance: formatBalance(usdcBalance, 6) }));
        } catch (error) {
            console.error('Error refreshing USDC balance:', error);
        }
    }, [state.proxyWalletAddress]);

    return {
        ...state,
        createProxyWallet,
        refreshBalance,
        refreshUsdcBalance,
        hasProxyWallet: state.proxyWalletAddress !== null,
    };
}

export default useProxyWallet;
