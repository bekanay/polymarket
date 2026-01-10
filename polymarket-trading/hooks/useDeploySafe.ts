/**
 * useDeploySafe Hook
 *
 * Deploys a Gnosis Safe proxy wallet using the Polymarket Builder Relayer Client.
 * Uses Privy for authentication and wallet access.
 * Checks on-chain if a Safe already exists for the user.
 *
 * @requires @polymarket/builder-relayer-client
 * @requires @polymarket/builder-signing-sdk
 * @requires viem
 */

'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createWalletClient, custom, type WalletClient, type Chain } from 'viem';
import { polygon } from 'viem/chains';
import { RelayClient, RelayerTxType } from '@polymarket/builder-relayer-client';
import { BuilderConfig, type BuilderApiKeyCreds } from '@polymarket/builder-signing-sdk';
// Import deriveSafe from the builder module
import { deriveSafe } from '@polymarket/builder-relayer-client/dist/builder/derive';

// Configuration constants
const POLYGON_CHAIN_ID = 137;
const RELAYER_URL = process.env.NEXT_PUBLIC_POLYMARKET_RELAYER_URL || 'https://relayer-v2.polymarket.com';
const POLYGON_RPC_URL = process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com';

// Polymarket's Gnosis Safe Factory address
const POLYMARKET_SAFE_FACTORY = '0xaacfeea03eb1561c4e67d661e40682bd20e3541b';

interface DeploySafeState {
    isLoading: boolean;
    isDeploying: boolean;
    isDeployed: boolean;
    safeAddress: string | null;
    transactionHash: string | null;
    error: string | null;
}

interface UseDeploySafeReturn extends DeploySafeState {
    deploySafe: () => Promise<string | null>;
    reset: () => void;
    checkExistingSafe: () => Promise<void>;
}

/**
 * Get Builder API credentials from environment variables
 */
function getBuilderCredentials(): BuilderApiKeyCreds | null {
    const key = process.env.NEXT_PUBLIC_POLYMARKET_API_KEY;
    const secret = process.env.NEXT_PUBLIC_POLYMARKET_SECRET;
    const passphrase = process.env.NEXT_PUBLIC_POLYMARKET_PASSPHRASE;

    if (!key || !secret || !passphrase) {
        console.error('Missing Builder API credentials in environment variables');
        return null;
    }

    return { key, secret, passphrase };
}

/**
 * Check if a contract exists at an address by calling eth_getCode
 */
async function checkContractExists(address: string): Promise<boolean> {
    try {
        const response = await fetch(POLYGON_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_getCode',
                params: [address, 'latest'],
                id: 1,
            }),
        });
        const data = await response.json();
        return data.result && data.result !== '0x';
    } catch (error) {
        console.error('Error checking contract existence:', error);
        return false;
    }
}

/**
 * Hook to deploy a Gnosis Safe proxy wallet via Polymarket's relayer
 *
 * Uses RelayerTxType.SAFE to deploy a Gnosis Safe (not a Proxy wallet).
 * The relayer handles gas fees, making deployment gasless for the user.
 * Automatically checks if a Safe already exists for the user on mount.
 *
 * @example
 * ```tsx
 * const { deploySafe, isDeploying, safeAddress, error, isLoading } = useDeploySafe();
 *
 * if (isLoading) return <div>Checking for existing Safe...</div>;
 * if (safeAddress) return <div>Safe: {safeAddress}</div>;
 *
 * const handleDeploy = async () => {
 *   const address = await deploySafe();
 *   if (address) {
 *     console.log('Safe deployed at:', address);
 *   }
 * };
 * ```
 */
export function useDeploySafe(): UseDeploySafeReturn {
    const { authenticated, ready } = usePrivy();
    const { wallets } = useWallets();

    const [state, setState] = useState<DeploySafeState>({
        isLoading: true,
        isDeploying: false,
        isDeployed: false,
        safeAddress: null,
        transactionHash: null,
        error: null,
    });

    // Get the embedded wallet from Privy
    const embeddedWallet = useMemo(() => {
        return wallets.find((wallet) => wallet.walletClientType === 'privy');
    }, [wallets]);

    /**
     * Check if a Safe already exists for the user's wallet
     */
    const checkExistingSafe = useCallback(async () => {
        if (!embeddedWallet?.address) {
            setState((prev) => ({ ...prev, isLoading: false }));
            return;
        }

        try {
            console.log('Checking for existing Safe...');
            console.log('EOA Address:', embeddedWallet.address);
            console.log('Safe Factory:', POLYMARKET_SAFE_FACTORY);

            // Derive the expected Safe address from the user's EOA
            const expectedSafeAddress = deriveSafe(
                embeddedWallet.address,
                POLYMARKET_SAFE_FACTORY
            );

            console.log('Derived Safe Address:', expectedSafeAddress);

            // Check if the Safe contract exists on-chain
            const exists = await checkContractExists(expectedSafeAddress);

            console.log('Safe exists on-chain:', exists);

            if (exists) {
                setState({
                    isLoading: false,
                    isDeploying: false,
                    isDeployed: true,
                    safeAddress: expectedSafeAddress,
                    transactionHash: null,
                    error: null,
                });
            } else {
                setState((prev) => ({
                    ...prev,
                    isLoading: false,
                    isDeployed: false,
                    safeAddress: null,
                }));
            }
        } catch (error) {
            console.error('Error checking for existing Safe:', error);
            setState((prev) => ({
                ...prev,
                isLoading: false,
                error: 'Failed to check for existing Safe',
            }));
        }
    }, [embeddedWallet?.address]);

    // Check for existing Safe on mount when wallet is available
    useEffect(() => {
        if (ready && authenticated && embeddedWallet?.address) {
            checkExistingSafe();
        } else if (ready && !authenticated) {
            setState((prev) => ({ ...prev, isLoading: false }));
        }
    }, [ready, authenticated, embeddedWallet?.address, checkExistingSafe]);

    // Reset state
    const reset = useCallback(() => {
        setState({
            isLoading: false,
            isDeploying: false,
            isDeployed: false,
            safeAddress: null,
            transactionHash: null,
            error: null,
        });
    }, []);

    /**
     * Create a viem WalletClient from Privy's embedded wallet
     */
    const createViemWalletClient = useCallback(async (): Promise<WalletClient | null> => {
        if (!embeddedWallet) {
            console.error('No Privy embedded wallet found');
            return null;
        }

        try {
            // Switch to Polygon if not already
            await embeddedWallet.switchChain(POLYGON_CHAIN_ID);

            // Get the EIP-1193 provider from Privy
            const ethereumProvider = await embeddedWallet.getEthereumProvider();

            // Create viem WalletClient using custom transport
            const walletClient = createWalletClient({
                account: embeddedWallet.address as `0x${string}`,
                chain: polygon as Chain,
                transport: custom(ethereumProvider),
            });

            return walletClient;
        } catch (error) {
            console.error('Failed to create viem WalletClient:', error);
            return null;
        }
    }, [embeddedWallet]);

    /**
     * Deploy a Gnosis Safe using Polymarket's relayer
     */
    const deploySafe = useCallback(async (): Promise<string | null> => {
        // Pre-flight checks
        if (!ready) {
            setState((prev) => ({ ...prev, error: 'Privy is not ready' }));
            return null;
        }

        if (!authenticated) {
            setState((prev) => ({ ...prev, error: 'User is not authenticated' }));
            return null;
        }

        if (!embeddedWallet) {
            setState((prev) => ({ ...prev, error: 'No Privy embedded wallet found. Please ensure you have an embedded wallet.' }));
            return null;
        }

        // Get Builder credentials
        const builderCreds = getBuilderCredentials();
        if (!builderCreds) {
            setState((prev) => ({ ...prev, error: 'Missing Builder API credentials. Check your environment variables.' }));
            return null;
        }

        setState((prev) => ({ ...prev, isDeploying: true, error: null }));

        try {
            // Create viem WalletClient
            const walletClient = await createViemWalletClient();
            if (!walletClient) {
                throw new Error('Failed to create wallet client');
            }

            console.log('=== Deploying Gnosis Safe ===');
            console.log('Relayer URL:', RELAYER_URL);
            console.log('Chain ID:', POLYGON_CHAIN_ID);
            console.log('Wallet Address:', embeddedWallet.address);

            // Initialize BuilderConfig with local credentials
            const builderConfig = new BuilderConfig({
                localBuilderCreds: builderCreds,
            });

            // Create RelayClient with SAFE transaction type
            const relayClient = new RelayClient(
                RELAYER_URL,
                POLYGON_CHAIN_ID,
                walletClient,
                builderConfig,
                RelayerTxType.SAFE // Use SAFE, not PROXY
            );

            console.log('Initiating Safe deployment via relayer...');

            // Deploy the Safe
            const response = await relayClient.deploy();

            console.log('Deployment initiated, waiting for confirmation...');

            // Wait for the deployment to complete
            const result = await response.wait();

            if (result) {
                console.log('=== Safe Deployed Successfully ===');
                console.log('Transaction Hash:', result.transactionHash);
                console.log('Safe Address:', result.proxyAddress);

                setState({
                    isLoading: false,
                    isDeploying: false,
                    isDeployed: true,
                    safeAddress: result.proxyAddress,
                    transactionHash: result.transactionHash,
                    error: null,
                });

                return result.proxyAddress;
            } else {
                throw new Error('Safe deployment failed - no result returned');
            }
        } catch (error) {
            console.error('Safe deployment error:', error);

            const errorMessage = error instanceof Error
                ? error.message
                : 'Unknown error during Safe deployment';

            setState((prev) => ({
                ...prev,
                isDeploying: false,
                error: errorMessage,
            }));

            return null;
        }
    }, [ready, authenticated, embeddedWallet, createViemWalletClient]);

    return {
        ...state,
        deploySafe,
        reset,
        checkExistingSafe,
    };
}

export default useDeploySafe;
