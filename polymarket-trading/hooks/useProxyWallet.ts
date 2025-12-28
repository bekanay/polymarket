/**
 * useProxyWallet Hook
 * 
 * React hook for managing proxy wallets in the Polymarket trading interface.
 * Integrates with Privy for authentication and Gnosis Safe for wallet management.
 * Uses Privy's gas sponsorship for transaction fees.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { usePrivy, useWallets, useSendTransaction } from '@privy-io/react-auth';
import { ethers, Interface, keccak256, toUtf8Bytes, AbiCoder, getCreate2Address } from 'ethers';
import { getProxyWalletService } from '@/lib/wallet/proxyWallet';

// Polygon mainnet contract addresses (Gnosis Safe v1.3.0)
const SAFE_CONTRACTS = {
    proxyFactory: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
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

// Interface for proxy wallet creation result  
export interface ProxyWalletResult {
    proxyWalletAddress: string;
    isNew: boolean;
    transactionHash?: string;
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
    const { authenticated, ready, user } = usePrivy();
    const { wallets } = useWallets();
    const { sendTransaction } = useSendTransaction();

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
                        error: null,
                    }));
                } else {
                    setState(prev => ({
                        ...prev,
                        isLoading: false,
                        proxyWalletAddress: null,
                        error: null,
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

    // Create proxy wallet using Privy's gas-sponsored transactions
    const createProxyWallet = useCallback(async (): Promise<ProxyWalletResult | null> => {
        const userAddress = getConnectedWalletAddress();

        if (!authenticated || !userAddress) {
            setState(prev => ({ ...prev, error: 'Please connect your wallet first' }));
            return null;
        }

        setState(prev => ({ ...prev, isCreating: true, error: null }));

        try {
            const service = getProxyWalletService();

            // Check if wallet already exists
            const existingWallet = service.getProxyWallet(userAddress);
            if (existingWallet) {
                setState(prev => ({
                    ...prev,
                    proxyWalletAddress: existingWallet,
                    isCreating: false,
                }));
                return {
                    proxyWalletAddress: existingWallet,
                    isNew: false,
                };
            }

            // Generate the Safe setup data (initializer)
            const initializer = generateSafeSetupData(userAddress);
            const saltNonce = generateSaltNonce(userAddress);

            // Encode the createProxyWithNonce function call
            const proxyFactoryInterface = new Interface(PROXY_FACTORY_ABI);
            const callData = proxyFactoryInterface.encodeFunctionData('createProxyWithNonce', [
                SAFE_CONTRACTS.safeMasterCopyL2,
                initializer,
                saltNonce,
            ]);

            console.log('Creating proxy wallet with gas sponsorship...');

            // Send transaction using Privy's gas sponsorship
            const txResult = await sendTransaction(
                {
                    to: SAFE_CONTRACTS.proxyFactory,
                    data: callData,
                    chainId: 137, // Polygon Mainnet
                },
                {
                    // Enable gas sponsorship from Privy
                    sponsor: true,
                }
            );

            console.log('Transaction sent:', txResult);

            // useSendTransaction returns { hash: string }, need to wait for receipt
            const txHash = txResult.hash;
            let proxyWalletAddress: string | null = null;

            // Wait for transaction receipt using provider
            const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com');

            // Poll for receipt
            let receipt = null;
            for (let i = 0; i < 30; i++) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                receipt = await provider.getTransactionReceipt(txHash);
                if (receipt) break;
            }

            if (!receipt || receipt.status === 0) {
                throw new Error('Transaction failed or timed out');
            }

            // Extract proxy address from transaction logs
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

            // If we couldn't extract from logs, predict the address
            if (!proxyWalletAddress) {
                proxyWalletAddress = await service.predictProxyAddress(userAddress);
                // Verify it was deployed
                const isDeployed = await service.isSafeDeployed(proxyWalletAddress);
                if (!isDeployed) {
                    throw new Error('Proxy wallet deployment could not be verified');
                }
            }

            // Store the mapping
            service.recoverWallet(userAddress, proxyWalletAddress);

            // Fetch initial balances
            const [balance, usdcBalance] = await Promise.all([
                service.getProxyWalletBalance(proxyWalletAddress).catch(() => '0'),
                service.getUSDCBalance(proxyWalletAddress).catch(() => '0'),
            ]);

            setState(prev => ({
                ...prev,
                proxyWalletAddress: proxyWalletAddress,
                balance: formatBalance(balance, 18),
                usdcBalance: formatBalance(usdcBalance, 6),
                isCreating: false,
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
                isCreating: false,
                error: `Failed to create proxy wallet: ${errorMessage}`
            }));
            return null;
        }
    }, [authenticated, getConnectedWalletAddress, sendTransaction]);

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
