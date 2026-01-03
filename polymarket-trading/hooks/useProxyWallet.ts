/**
 * useProxyWallet Hook
 * 
 * React hook for managing proxy wallets in the Polymarket trading interface.
 * Integrates with Privy for authentication and Gnosis Safe for wallet management.
 * Uses Privy's gas sponsorship for transaction fees.
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { usePrivy, useWallets, useSendTransaction, useCreateWallet } from '@privy-io/react-auth';
import { ethers, Interface, keccak256, toUtf8Bytes } from 'ethers';
import { getProxyWalletService } from '@/lib/wallet/proxyWallet';
import { POLYMARKET_PROXY_FACTORY, POLYGON_CHAIN_ID } from '@/constants';

// Polygon mainnet contract addresses (Gnosis Safe v1.3.0)
const SAFE_CONTRACTS = {
    proxyFactory: POLYMARKET_PROXY_FACTORY,
    safeMasterCopyL2: '0x3E5c63644E683549055b9Be8653de26E0B4CD36E',
    fallbackHandler: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
};

// Safe Proxy Factory ABI (minimal for deployment)
const PROXY_FACTORY_ABI = [
    'function createProxyWithNonce(address _singleton, bytes memory initializer, uint256 saltNonce) public returns (address proxy)',
    'function proxyCreationCode() public pure returns (bytes memory)',
    'event ProxyCreation(address proxy, address singleton)',
];

// Safe Master Copy ABI (minimal for initialization)
const SAFE_ABI = [
    'function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver) external',
];

// State interface for the hook
interface ProxyWalletState {
    proxyWalletAddress: string | null;
    isLoading: boolean;
    isCreating: boolean;
    error: string | null;
    balance: string | null;
    usdcBalance: string | null;
}

type EmbeddedWallet = {
    address: string;
};

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
 * Generate Safe setup data (initializer bytes)
 */
function generateSafeSetupData(ownerAddress: string): string {
    const safeInterface = new Interface(SAFE_ABI);

    return safeInterface.encodeFunctionData('setup', [
        [ownerAddress],          // owners array
        1,                        // threshold
        ethers.ZeroAddress,       // to (optional delegate call)
        '0x',                     // data (optional delegate call data)
        SAFE_CONTRACTS.fallbackHandler, // fallback handler
        ethers.ZeroAddress,       // payment token (0 = ETH)
        0,                        // payment amount
        ethers.ZeroAddress,       // payment receiver
    ]);
}

/**
 * Generate a deterministic salt nonce from owner address
 */
function generateSaltNonce(ownerAddress: string): string {
    const hash = keccak256(toUtf8Bytes(`polymarket-proxy-${ownerAddress.toLowerCase()}`));
    const shortHash = hash.slice(0, 18);
    return BigInt(shortHash).toString();
}

/**
 * Hook to manage proxy wallet creation and state
 * Uses Privy's gas sponsorship for transaction fees
 */
export function useProxyWallet(): UseProxyWalletReturn {
    const { authenticated, ready } = usePrivy();
    const { wallets } = useWallets();
    const { sendTransaction } = useSendTransaction();
    const { createWallet } = useCreateWallet();

    const [state, setState] = useState<ProxyWalletState>({
        proxyWalletAddress: null,
        isLoading: true,
        isCreating: false,
        error: null,
        balance: null,
        usdcBalance: null,
    });
    const autoDeployAttemptRef = useRef<string | null>(null);
    const deployPromiseRef = useRef<Promise<ProxyWalletResult | null> | null>(null);
    const embeddedWalletPromiseRef = useRef<Promise<EmbeddedWallet | null> | null>(null);

    const getEmbeddedWallet = useCallback((): EmbeddedWallet | null => {
        const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
        return embeddedWallet ? { address: embeddedWallet.address } : null;
    }, [wallets]);

    const ensureEmbeddedWallet = useCallback(async (): Promise<EmbeddedWallet | null> => {
        const existingWallet = getEmbeddedWallet();
        if (existingWallet) {
            return existingWallet;
        }

        if (embeddedWalletPromiseRef.current) {
            return embeddedWalletPromiseRef.current;
        }

        const createPromise = createWallet()
            .then(wallet => ({ address: wallet.address }))
            .catch(error => {
                console.error('Failed to create embedded wallet:', error);
                setState(prev => ({
                    ...prev,
                    error: 'Embedded wallet required for gas-sponsored transactions.',
                }));
                return null;
            })
            .finally(() => {
                embeddedWalletPromiseRef.current = null;
            });

        embeddedWalletPromiseRef.current = createPromise;
        return createPromise;
    }, [createWallet, getEmbeddedWallet]);

    const deployProxyWallet = useCallback(async (): Promise<ProxyWalletResult | null> => {
        if (deployPromiseRef.current) {
            return deployPromiseRef.current;
        }

        if (!authenticated) {
            setState(prev => ({ ...prev, error: 'Please connect your wallet first' }));
            return null;
        }

        const deployPromise = (async (): Promise<ProxyWalletResult | null> => {
            try {
                const embeddedWallet = await ensureEmbeddedWallet();
                if (!embeddedWallet) {
                    setState(prev => ({
                        ...prev,
                        isLoading: false,
                        error: 'Embedded wallet required for gas-sponsored transactions.',
                    }));
                    return null;
                }

                const ownerAddress = embeddedWallet.address;
                const service = getProxyWalletService();

                const existingWallet = await service.checkAndRecoverWallet(ownerAddress);
                if (existingWallet) {
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
                        isCreating: false,
                        error: null,
                    }));

                    return {
                        proxyWalletAddress: existingWallet,
                        isNew: false,
                    };
                }

                setState(prev => ({ ...prev, isCreating: true, isLoading: false, error: null }));

                const initializer = generateSafeSetupData(ownerAddress);
                const saltNonce = generateSaltNonce(ownerAddress);

                const proxyFactoryInterface = new Interface(PROXY_FACTORY_ABI);
                const callData = proxyFactoryInterface.encodeFunctionData('createProxyWithNonce', [
                    SAFE_CONTRACTS.safeMasterCopyL2,
                    initializer,
                    saltNonce,
                ]);

                console.log('Creating proxy wallet with gas sponsorship...');

                const txResult = await sendTransaction(
                    {
                        to: SAFE_CONTRACTS.proxyFactory,
                        data: callData,
                        chainId: POLYGON_CHAIN_ID,
                    },
                    {
                        sponsor: true,
                        address: ownerAddress,
                    }
                );

                console.log('Transaction sent:', txResult);

                const txHash = txResult.hash;
                let proxyWalletAddress: string | null = null;

                const rpcUrl = process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com';
                const provider = new ethers.JsonRpcProvider(rpcUrl);

                let receipt = null;
                for (let i = 0; i < 30; i++) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    receipt = await provider.getTransactionReceipt(txHash);
                    if (receipt) break;
                }

                if (!receipt || receipt.status === 0) {
                    throw new Error('Transaction failed or timed out');
                }

                for (const log of receipt.logs) {
                    try {
                        const parsed = proxyFactoryInterface.parseLog({
                            topics: log.topics as string[],
                            data: log.data,
                        });
                        if (parsed && parsed.name === 'ProxyCreation') {
                            proxyWalletAddress = parsed.args[0];
                            break;
                        }
                    } catch {
                        // Not a ProxyCreation event, continue
                    }
                }

                if (!proxyWalletAddress) {
                    proxyWalletAddress = await service.predictProxyAddress(ownerAddress);
                    const isDeployed = await service.isSafeDeployed(proxyWalletAddress);
                    if (!isDeployed) {
                        throw new Error('Proxy wallet deployment could not be verified');
                    }
                }

                service.recoverWallet(ownerAddress, proxyWalletAddress);

                const [balance, usdcBalance] = await Promise.all([
                    service.getProxyWalletBalance(proxyWalletAddress).catch(() => '0'),
                    service.getUSDCBalance(proxyWalletAddress).catch(() => '0'),
                ]);

                setState(prev => ({
                    ...prev,
                    proxyWalletAddress: proxyWalletAddress,
                    balance: formatBalance(balance, 18),
                    usdcBalance: formatBalance(usdcBalance, 6),
                    isLoading: false,
                    isCreating: false,
                    error: null,
                }));

                return {
                    proxyWalletAddress: proxyWalletAddress,
                    isNew: true,
                    transactionHash: txHash,
                };
            } catch (error) {
                console.error('Error creating proxy wallet:', error);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    isCreating: false,
                    error: `Failed to create proxy wallet: ${errorMessage}`
                }));
                return null;
            } finally {
                deployPromiseRef.current = null;
            }
        })();

        deployPromiseRef.current = deployPromise;
        return deployPromise;
    }, [authenticated, ensureEmbeddedWallet, sendTransaction]);

    useEffect(() => {
        if (!ready) return;

        const checkExistingWallet = async () => {
            if (!authenticated) {
                autoDeployAttemptRef.current = null;
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    proxyWalletAddress: null,
                    balance: null,
                    usdcBalance: null,
                }));
                return;
            }

            const embeddedWallet = await ensureEmbeddedWallet();
            const ownerAddress = embeddedWallet?.address;

            if (!ownerAddress) {
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    proxyWalletAddress: null,
                }));
                return;
            }

            try {
                const service = getProxyWalletService();

                console.log('Checking for existing on-chain proxy wallet...');
                const existingWallet = await service.checkAndRecoverWallet(ownerAddress);

                if (existingWallet) {
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
                        error: null,
                    }));
                } else {
                    setState(prev => ({
                        ...prev,
                        isLoading: false,
                        proxyWalletAddress: null,
                        error: null,
                    }));

                    if (autoDeployAttemptRef.current !== ownerAddress) {
                        autoDeployAttemptRef.current = ownerAddress;
                        void deployProxyWallet();
                    }
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
    }, [ready, authenticated, ensureEmbeddedWallet, deployProxyWallet]);

    const createProxyWallet = useCallback(async (): Promise<ProxyWalletResult | null> => {
        return deployProxyWallet();
    }, [deployProxyWallet]);

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
        isDeploying: state.isCreating,
        proxyAddress: state.proxyWalletAddress,
        createProxyWallet,
        refreshBalance,
        refreshUsdcBalance,
        hasProxyWallet: state.proxyWalletAddress !== null,
    };
}

export default useProxyWallet;
