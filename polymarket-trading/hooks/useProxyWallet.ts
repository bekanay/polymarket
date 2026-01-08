/**
 * useProxyWallet Hook
 *
 * Manages the user's Polymarket proxy wallet (Gnosis Safe).
 * Handles deployment, status checking, and balance fetching.
 * 
 * Uses client-side signing with Privy gas sponsorship.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { usePrivy, useWallets, useSendTransaction } from '@privy-io/react-auth';
import { ethers } from 'ethers';

// USDC contract on Polygon (Bridged USDC.e - used by Polymarket)
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_ABI = ['function balanceOf(address) view returns (uint256)'];

// Polymarket-compatible Gnosis Safe v1.3.0 addresses on Polygon
const SAFE_CONSTANTS = {
    PROXY_FACTORY: '0xaacfeea03eb1561c4e67d661e40682bd20e3541b',
    SINGLETON_L2: '0x3e5c6364520a8308fbf4291975b954602b17f038',
    FALLBACK_HANDLER: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
    POLYGON_CHAIN_ID: 137,
} as const;

// Minimal ABI for Gnosis Safe Proxy Factory
const PROXY_FACTORY_ABI = [
    'function createProxyWithNonce(address _singleton, bytes memory initializer, uint256 saltNonce) public returns (address proxy)',
    'function proxyCreationCode() public pure returns (bytes memory)',
];

// Minimal ABI for Gnosis Safe setup function
const SAFE_SETUP_ABI = [
    'function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver) external',
];

interface ProxyWalletState {
    safeAddress: string | null;
    isDeployed: boolean;
    isLoading: boolean;
    isDeploying: boolean;
    error: string | null;
    balance: string | null;
    usdcBalance: string | null;
    txHash: string | null;
}

interface UseProxyWalletReturn extends ProxyWalletState {
    deployProxyWallet: () => Promise<void>;
    refreshStatus: () => Promise<void>;
    refreshBalances: () => Promise<void>;
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
        const fractionalStr = fractionalPart.toString().padStart(decimals, '0').slice(0, 4);
        return `${wholePart}.${fractionalStr}`;
    } catch {
        return '0.0000';
    }
}

/**
 * Encodes the Gnosis Safe setup function calldata
 */
function encodeSetupCalldata(ownerAddress: string): string {
    const safeInterface = new ethers.Interface(SAFE_SETUP_ABI);

    const owners = [ownerAddress];
    const threshold = 1;
    const toAddress = ethers.ZeroAddress;
    const data = '0x';
    const fallbackHandler = SAFE_CONSTANTS.FALLBACK_HANDLER;
    const paymentToken = ethers.ZeroAddress;
    const payment = 0;
    const paymentReceiver = ethers.ZeroAddress;

    return safeInterface.encodeFunctionData('setup', [
        owners,
        threshold,
        toAddress,
        data,
        fallbackHandler,
        paymentToken,
        payment,
        paymentReceiver,
    ]);
}

/**
 * Encodes the createProxyWithNonce function calldata
 */
function encodeCreateProxyWithNonce(initializer: string, saltNonce: bigint): string {
    const factoryInterface = new ethers.Interface(PROXY_FACTORY_ABI);
    return factoryInterface.encodeFunctionData('createProxyWithNonce', [
        SAFE_CONSTANTS.SINGLETON_L2,
        initializer,
        saltNonce,
    ]);
}

/**
 * Computes the deterministic Safe address using CREATE2
 */
function computeSafeAddress(
    initializer: string,
    saltNonce: bigint,
    proxyCreationCode: string
): string {
    const initializerHash = ethers.keccak256(initializer);
    const salt = ethers.keccak256(
        ethers.solidityPacked(['bytes32', 'uint256'], [initializerHash, saltNonce])
    );

    const singletonPadded = ethers.zeroPadValue(SAFE_CONSTANTS.SINGLETON_L2, 32);
    const initCode = ethers.concat([proxyCreationCode, singletonPadded]);
    const initCodeHash = ethers.keccak256(initCode);

    const create2Input = ethers.concat([
        '0xff',
        SAFE_CONSTANTS.PROXY_FACTORY,
        salt,
        initCodeHash,
    ]);

    return ethers.getAddress('0x' + ethers.keccak256(create2Input).slice(-40));
}

/**
 * Creates a deterministic salt nonce from user address
 */
function deterministicSaltNonce(userAddress: string, index: number = 0): bigint {
    const hash = ethers.keccak256(
        ethers.solidityPacked(['address', 'uint256'], [userAddress, index])
    );
    return BigInt(hash);
}

/**
 * Hook to manage user's Polymarket proxy wallet (Gnosis Safe)
 */
export function useProxyWallet(): UseProxyWalletReturn {
    const { authenticated, ready, user } = usePrivy();
    const { wallets } = useWallets();
    const { sendTransaction } = useSendTransaction();

    const [state, setState] = useState<ProxyWalletState>({
        safeAddress: null,
        isDeployed: false,
        isLoading: true,
        isDeploying: false,
        error: null,
        balance: null,
        usdcBalance: null,
        txHash: null,
    });

    // Get user's EOA address (the address that will own the Safe)
    const getUserEoaAddress = useCallback((): string | null => {
        if (!user) return null;

        // Check for external wallet first (MetaMask login)
        const linkedWallet = user.linkedAccounts?.find(
            account => account.type === 'wallet'
        );
        const loggedInWithExternalWallet = linkedWallet && linkedWallet.walletClientType !== 'privy';

        if (loggedInWithExternalWallet) {
            const externalWallet = wallets.find(w => w.walletClientType !== 'privy');
            if (externalWallet) return externalWallet.address;
        }

        // Check for embedded wallet
        const embeddedWallet = user.linkedAccounts?.find(
            account => account.type === 'wallet' && account.walletClientType === 'privy'
        );
        if (embeddedWallet && 'address' in embeddedWallet) {
            return embeddedWallet.address;
        }

        // Fallback to first wallet
        if (wallets.length > 0) {
            return wallets[0].address;
        }

        return user.wallet?.address || null;
    }, [user, wallets]);

    // Get the active wallet for signing
    const getActiveWallet = useCallback(() => {
        if (!user || wallets.length === 0) return null;

        // Check for external wallet first
        const linkedWallet = user.linkedAccounts?.find(
            account => account.type === 'wallet'
        );
        const loggedInWithExternalWallet = linkedWallet && linkedWallet.walletClientType !== 'privy';

        if (loggedInWithExternalWallet) {
            return wallets.find(w => w.walletClientType !== 'privy') || wallets[0];
        }

        // Use embedded wallet
        return wallets.find(w => w.walletClientType === 'privy') || wallets[0];
    }, [user, wallets]);

    // Fetch balances for the Safe
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
            console.error('Error fetching Safe balances:', error);
            return { balance: '0.0000', usdcBalance: '0.0000' };
        }
    }, []);

    // Check if Safe is already deployed
    const checkDeploymentStatus = useCallback(async () => {
        const eoaAddress = getUserEoaAddress();
        if (!eoaAddress) {
            setState(prev => ({ ...prev, isLoading: false }));
            return;
        }

        try {
            const normalizedAddress = ethers.getAddress(eoaAddress);
            const saltNonce = deterministicSaltNonce(normalizedAddress, 0);

            const rpcUrl = process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com';
            const provider = new ethers.JsonRpcProvider(rpcUrl);

            // Get proxy creation code
            const factory = new ethers.Contract(
                SAFE_CONSTANTS.PROXY_FACTORY,
                PROXY_FACTORY_ABI,
                provider
            );
            const proxyCreationCode = await factory.proxyCreationCode();

            // Compute expected Safe address
            const initializer = encodeSetupCalldata(normalizedAddress);
            const expectedSafeAddress = computeSafeAddress(initializer, saltNonce, proxyCreationCode);

            // Check if deployed
            const code = await provider.getCode(expectedSafeAddress);
            const isDeployed = code !== '0x';

            if (isDeployed) {
                const balances = await fetchBalances(expectedSafeAddress);
                setState(prev => ({
                    ...prev,
                    safeAddress: expectedSafeAddress,
                    isDeployed: true,
                    isLoading: false,
                    balance: balances.balance,
                    usdcBalance: balances.usdcBalance,
                }));
            } else {
                setState(prev => ({
                    ...prev,
                    safeAddress: null,
                    isDeployed: false,
                    isLoading: false,
                }));
            }
        } catch (error) {
            console.error('Error checking Safe status:', error);
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: 'Failed to check proxy wallet status',
            }));
        }
    }, [getUserEoaAddress, fetchBalances]);

    // Deploy proxy wallet using client-side signing with Privy gas sponsorship
    const deployProxyWallet = useCallback(async () => {
        const eoaAddress = getUserEoaAddress();
        const activeWallet = getActiveWallet();

        if (!eoaAddress) {
            setState(prev => ({ ...prev, error: 'No wallet address found' }));
            return;
        }

        if (!activeWallet) {
            setState(prev => ({ ...prev, error: 'No active wallet found for signing' }));
            return;
        }

        setState(prev => ({ ...prev, isDeploying: true, error: null }));

        try {
            const normalizedAddress = ethers.getAddress(eoaAddress);
            const saltNonce = deterministicSaltNonce(normalizedAddress, 0);

            // Encode the deployment calldata
            const initializer = encodeSetupCalldata(normalizedAddress);
            const deployCalldata = encodeCreateProxyWithNonce(initializer, saltNonce);

            // Get expected Safe address
            const rpcUrl = process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com';
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const factory = new ethers.Contract(
                SAFE_CONSTANTS.PROXY_FACTORY,
                PROXY_FACTORY_ABI,
                provider
            );
            const proxyCreationCode = await factory.proxyCreationCode();
            const expectedSafeAddress = computeSafeAddress(initializer, saltNonce, proxyCreationCode);

            // Check if already deployed
            const existingCode = await provider.getCode(expectedSafeAddress);
            if (existingCode !== '0x') {
                const balances = await fetchBalances(expectedSafeAddress);
                setState(prev => ({
                    ...prev,
                    safeAddress: expectedSafeAddress,
                    isDeployed: true,
                    isDeploying: false,
                    balance: balances.balance,
                    usdcBalance: balances.usdcBalance,
                }));
                return;
            }

            // Ensure wallet is on Polygon
            await activeWallet.switchChain(SAFE_CONSTANTS.POLYGON_CHAIN_ID);

            // Send transaction using Privy's sendTransaction (gas-sponsored)
            const txReceipt = await sendTransaction(
                {
                    to: SAFE_CONSTANTS.PROXY_FACTORY,
                    data: deployCalldata as `0x${string}`,
                    value: BigInt(0),
                    chainId: SAFE_CONSTANTS.POLYGON_CHAIN_ID,
                },
                { sponsor: true } // Enable Privy gas sponsorship
            );

            console.log('Safe deployment transaction:', txReceipt);

            setState(prev => ({
                ...prev,
                safeAddress: expectedSafeAddress,
                isDeployed: true,
                isDeploying: false,
                txHash: txReceipt.hash || null,
                balance: '0.0000',
                usdcBalance: '0.0000',
            }));
        } catch (error) {
            console.error('Error deploying proxy wallet:', error);
            setState(prev => ({
                ...prev,
                isDeploying: false,
                error: error instanceof Error ? error.message : 'Failed to deploy proxy wallet',
            }));
        }
    }, [getUserEoaAddress, getActiveWallet, sendTransaction, fetchBalances]);

    // Refresh status
    const refreshStatus = useCallback(async () => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));
        await checkDeploymentStatus();
    }, [checkDeploymentStatus]);

    // Refresh balances only
    const refreshBalances = useCallback(async () => {
        if (!state.safeAddress) return;

        try {
            const balances = await fetchBalances(state.safeAddress);
            setState(prev => ({
                ...prev,
                balance: balances.balance,
                usdcBalance: balances.usdcBalance,
            }));
        } catch (error) {
            console.error('Error refreshing balances:', error);
        }
    }, [state.safeAddress, fetchBalances]);

    // Check deployment status on mount and when user changes
    useEffect(() => {
        if (!ready || !authenticated) {
            setState(prev => ({ ...prev, isLoading: false }));
            return;
        }

        checkDeploymentStatus();
    }, [ready, authenticated, checkDeploymentStatus]);

    return {
        ...state,
        deployProxyWallet,
        refreshStatus,
        refreshBalances,
    };
}

export default useProxyWallet;
