/**
 * useApproveUSDC Hook
 * 
 * Handles USDC approval for Polymarket exchange.
 * Uses Privy's gas sponsorship for transaction fees.
 * Works directly with EOA wallet (no proxy wallet).
 */

'use client';

import { useState, useCallback } from 'react';
import { usePrivy, useWallets, useSendTransaction } from '@privy-io/react-auth';
import { ethers, Interface } from 'ethers';

// USDC contract on Polygon (Bridged USDC.e - used by Polymarket)
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
    const { authenticated } = usePrivy();
    const { wallets } = useWallets();
    const { sendTransaction } = useSendTransaction();
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
     * Approve USDC for Polymarket exchange with Privy gas sponsorship
     * Works directly with EOA wallet (no proxy wallet needed)
     */
    const approveUSDC = useCallback(async (): Promise<boolean> => {
        if (!authenticated) {
            setError('Please connect your wallet first');
            return false;
        }

        if (wallets.length === 0) {
            setError('No wallet found. Please log in again.');
            return false;
        }

        setIsApproving(true);
        setError(null);
        setTxHash(null);

        try {
            console.log('Approving USDC for Polymarket with gas sponsorship...');

            const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');

            if (!embeddedWallet) {
                throw new Error('Privy embedded wallet required for gas sponsorship.');
            }

            const ownerAddress = embeddedWallet.address;

            // Encode the approve function call
            const iface = new Interface(ERC20_ABI);
            const callData = iface.encodeFunctionData('approve', [
                POLYMARKET_EXCHANGE,
                MAX_UINT256,
            ]);

            // Send transaction directly to USDC contract using Privy's gas sponsorship
            const txResult = await sendTransaction(
                {
                    to: USDC_ADDRESS,
                    data: callData,
                    chainId: 137, // Polygon Mainnet
                },
                {
                    // Enable gas sponsorship from Privy
                    sponsor: true,
                    address: ownerAddress,
                }
            );

            console.log('Approve transaction sent:', txResult.hash);
            setTxHash(txResult.hash);

            // Wait for confirmation using public RPC
            console.log('Waiting for confirmation...');
            const rpcUrl = process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com';
            const provider = new ethers.JsonRpcProvider(rpcUrl);

            let receipt = null;
            for (let i = 0; i < 30; i++) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                receipt = await provider.getTransactionReceipt(txResult.hash);
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
    }, [authenticated, wallets, sendTransaction]);

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
