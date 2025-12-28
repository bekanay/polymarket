/**
 * useApproveUSDC Hook
 * 
 * Handles USDC approval for Polymarket exchange.
 * Uses wallet provider directly for the transaction.
 */

'use client';

import { useState, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ethers, Interface, BrowserProvider } from 'ethers';

// USDC contract on Polygon
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// Polymarket CTF Exchange contract
const POLYMARKET_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

// ERC20 ABI for approve and allowance
const ERC20_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
];

// Max uint256 for unlimited approval
const MAX_UINT256 = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');

interface UseApproveUSDCReturn {
    approveUSDC: () => Promise<boolean>;
    checkAllowance: (ownerAddress: string) => Promise<bigint>;
    checkBalance: (address: string) => Promise<bigint>;
    isApproving: boolean;
    error: string | null;
    txHash: string | null;
}

export function useApproveUSDC(): UseApproveUSDCReturn {
    const { authenticated, user } = usePrivy();
    const { wallets } = useWallets();
    const [isApproving, setIsApproving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);

    /**
     * Check current USDC allowance for Polymarket
     */
    const checkAllowance = useCallback(async (ownerAddress: string): Promise<bigint> => {
        try {
            const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com');
            const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
            const allowance = await usdc.allowance(ownerAddress, POLYMARKET_EXCHANGE);
            return allowance;
        } catch (err) {
            console.error('Error checking allowance:', err);
            return BigInt(0);
        }
    }, []);

    /**
     * Check USDC balance
     */
    const checkBalance = useCallback(async (address: string): Promise<bigint> => {
        try {
            const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com');
            const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
            const balance = await usdc.balanceOf(address);
            return balance;
        } catch (err) {
            console.error('Error checking balance:', err);
            return BigInt(0);
        }
    }, []);

    /**
     * Approve USDC for Polymarket exchange via wallet provider
     */
    const approveUSDC = useCallback(async (): Promise<boolean> => {
        if (!authenticated) {
            setError('Please connect your wallet first');
            return false;
        }

        // Find embedded wallet (for Google login) or first available wallet
        const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
        const connectedWallet = embeddedWallet || wallets[0];

        if (!connectedWallet) {
            setError('No wallet found. Please log in again.');
            return false;
        }

        setIsApproving(true);
        setError(null);
        setTxHash(null);

        try {
            console.log('Approving USDC for Polymarket...');
            console.log('Using wallet:', connectedWallet.address, 'type:', connectedWallet.walletClientType);

            // Get the wallet's Ethereum provider
            const ethereumProvider = await connectedWallet.getEthereumProvider();
            const provider = new BrowserProvider(ethereumProvider);
            const signer = await provider.getSigner();

            // Send approve transaction using raw request to avoid ethers parsing issues
            console.log('Sending approve transaction...');

            // Use eth_sendTransaction directly to avoid parsing issues with tx.wait()
            const txHash = await ethereumProvider.request({
                method: 'eth_sendTransaction',
                params: [{
                    from: connectedWallet.address,
                    to: USDC_ADDRESS,
                    data: new Interface(ERC20_ABI).encodeFunctionData('approve', [
                        POLYMARKET_EXCHANGE,
                        MAX_UINT256
                    ]),
                }],
            }) as string;

            console.log('Approve transaction sent:', txHash);
            setTxHash(txHash);

            // Wait for confirmation using public RPC
            console.log('Waiting for confirmation...');
            const publicProvider = new ethers.JsonRpcProvider('https://polygon-rpc.com');

            let receipt = null;
            for (let i = 0; i < 30; i++) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                receipt = await publicProvider.getTransactionReceipt(txHash);
                if (receipt) break;
            }

            if (!receipt || receipt.status === 0) {
                throw new Error('Approval transaction failed or timed out');
            }

            console.log('USDC approval confirmed!');
            return true;
        } catch (err) {
            console.error('Error approving USDC:', err);
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(`Failed to approve USDC: ${errorMessage}`);
            return false;
        } finally {
            setIsApproving(false);
        }
    }, [authenticated, wallets]);

    return {
        approveUSDC,
        checkAllowance,
        checkBalance,
        isApproving,
        error,
        txHash,
    };
}

export default useApproveUSDC;
