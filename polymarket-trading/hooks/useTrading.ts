/**
 * useTrading Hook
 * 
 * Initializes the Polymarket trading service with the user's wallet.
 * Must be used in authenticated components to enable order execution.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { getPolymarketService } from '@/lib/polymarket';
import { getProxyWalletService } from '@/lib/wallet/proxyWallet';

interface UseTradingReturn {
    isInitialized: boolean;
    isInitializing: boolean;
    error: string | null;
    proxyWalletAddress: string | null;
    initializeTrading: () => Promise<void>;
}

/**
 * Wraps an ethers v6 signer to be compatible with ethers v5 style
 * The Polymarket CLOB client expects _signTypedData (v5) instead of signTypedData (v6)
 */
function createV5CompatibleSigner(signer: ethers.Signer): any {
    // Create a proxy that intercepts property access
    return new Proxy(signer, {
        get(target, prop, receiver) {
            // Map v5's _signTypedData to v6's signTypedData
            if (prop === '_signTypedData') {
                return async (domain: any, types: any, value: any) => {
                    // Use signTypedData from ethers v6
                    return await (target as any).signTypedData(domain, types, value);
                };
            }

            // Handle getAddress for v5 compatibility
            if (prop === 'getAddress') {
                return () => target.getAddress();
            }

            // Handle signMessage
            if (prop === 'signMessage') {
                return (message: any) => target.signMessage(message);
            }

            // Default: return the original property
            const value = Reflect.get(target, prop, receiver);
            if (typeof value === 'function') {
                return value.bind(target);
            }
            return value;
        }
    });
}

export function useTrading(): UseTradingReturn {
    const { authenticated, user } = usePrivy();
    const { wallets } = useWallets();
    const [isInitialized, setIsInitialized] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [proxyWalletAddress, setProxyWalletAddress] = useState<string | null>(null);

    const initializeTrading = useCallback(async () => {
        if (!authenticated || !wallets.length) {
            setError('Please connect your wallet first');
            return;
        }

        const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
        const connectedWallet = embeddedWallet || wallets[0];

        if (!connectedWallet) {
            setError('No wallet available');
            return;
        }

        setIsInitializing(true);
        setError(null);

        try {
            // Get the Ethereum provider from the wallet
            const provider = await connectedWallet.getEthereumProvider();
            const ethersProvider = new ethers.BrowserProvider(provider);
            const signer = await ethersProvider.getSigner();
            const userAddress = await signer.getAddress();

            // Get or check for proxy wallet
            const proxyService = getProxyWalletService();
            let proxyAddress = proxyService.getProxyWallet(userAddress);

            // If no proxy wallet, try to check on-chain
            if (!proxyAddress) {
                proxyAddress = await proxyService.checkAndRecoverWallet(userAddress);
            }

            // Use user's main wallet if no proxy wallet
            const funderAddress = proxyAddress || userAddress;
            setProxyWalletAddress(funderAddress);

            // Wrap signer for ethers v5 compatibility (CLOB client expects _signTypedData)
            const v5Signer = createV5CompatibleSigner(signer);

            // Initialize the Polymarket service with v5-compatible signer
            const polyService = getPolymarketService();
            await polyService.initialize(v5Signer, funderAddress);

            setIsInitialized(true);
            console.log('Trading initialized with funder:', funderAddress);
        } catch (err) {
            console.error('Failed to initialize trading:', err);
            setError(err instanceof Error ? err.message : 'Failed to initialize trading');
        } finally {
            setIsInitializing(false);
        }
    }, [authenticated, wallets]);

    // Auto-initialize when authenticated
    useEffect(() => {
        if (authenticated && wallets.length > 0 && !isInitialized && !isInitializing) {
            initializeTrading();
        }
    }, [authenticated, wallets, isInitialized, isInitializing, initializeTrading]);

    return {
        isInitialized,
        isInitializing,
        error,
        proxyWalletAddress,
        initializeTrading,
    };
}

export default useTrading;
