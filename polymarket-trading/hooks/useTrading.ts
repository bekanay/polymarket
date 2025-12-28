/**
 * useTrading Hook
 * 
 * Initializes the Polymarket trading service with the user's wallet.
 * Must be used in authenticated components to enable order execution.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

    // Ref to prevent multiple initialization attempts
    const initializationAttempted = useRef(false);

    const initializeTrading = useCallback(async () => {
        // Prevent duplicate initialization
        if (initializationAttempted.current || isInitializing) {
            console.log('Initialization already in progress or completed, skipping...');
            return;
        }

        if (!authenticated || !wallets.length) {
            setError('Please connect your wallet first');
            return;
        }

        // Find embedded wallet (created by Privy for Google/email login)
        const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');

        // Check if user logged in via social (Google, email) or via external wallet
        const linkedWallet = user?.linkedAccounts?.find(a => a.type === 'wallet');
        const loggedInWithExternalWallet = linkedWallet && linkedWallet.walletClientType !== 'privy';

        // If user logged in with Google/email, ONLY use embedded wallet
        // If user logged in with MetaMask, use that wallet
        let connectedWallet;
        if (loggedInWithExternalWallet) {
            // User logged in with MetaMask or other external wallet
            connectedWallet = wallets.find(w => w.walletClientType !== 'privy') || embeddedWallet;
        } else {
            // User logged in with Google/email - use embedded wallet only
            connectedWallet = embeddedWallet;
        }

        if (!connectedWallet) {
            setError('No wallet available. Please try logging in again.');
            return;
        }

        console.log('Using wallet type:', connectedWallet.walletClientType);

        // Mark initialization as attempted
        initializationAttempted.current = true;
        setIsInitializing(true);
        setError(null);

        try {
            // Get the Ethereum provider from the wallet
            const provider = await connectedWallet.getEthereumProvider();
            const ethersProvider = new ethers.BrowserProvider(provider);
            const signer = await ethersProvider.getSigner();
            const userAddress = await signer.getAddress();

            // IMPORTANT: Gnosis Safe proxy wallets we create are NOT official Polymarket proxies.
            // Polymarket only accepts orders from:
            // 1. User's main wallet (EOA) - SignatureType.EOA
            // 2. Official Polymarket proxy contracts (registered on their exchange)
            // 
            // Our Gnosis Safe is for potential future gas sponsorship, NOT for Polymarket trading.
            // For now, always use the user's main wallet for trading.
            const funderAddress = userAddress;
            setProxyWalletAddress(funderAddress);

            console.log('Trading initialized with user wallet:', userAddress);

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
            // Reset flag to allow retry
            initializationAttempted.current = false;
        } finally {
            setIsInitializing(false);
        }
    }, [authenticated, wallets, isInitializing]);

    // Auto-initialize when authenticated (only once)
    useEffect(() => {
        if (authenticated && wallets.length > 0 && !isInitialized && !initializationAttempted.current) {
            initializeTrading();
        }
    }, [authenticated, wallets, isInitialized, initializeTrading]);

    return {
        isInitialized,
        isInitializing,
        error,
        proxyWalletAddress,
        initializeTrading,
    };
}

export default useTrading;
