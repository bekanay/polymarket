/**
 * useApproveCTF Hook
 * 
 * Handles Conditional Token approval for Polymarket exchange.
 * Required for SELLING positions (Yes/No tokens).
 * Uses Privy's gas sponsorship for transaction fees.
 * Works directly with EOA wallet (no proxy wallet).
 */

'use client';

import { useState, useCallback } from 'react';
import { usePrivy, useWallets, useSendTransaction } from '@privy-io/react-auth';
import { ethers, Interface } from 'ethers';

// Polymarket Conditional Token Framework (CTF) contract on Polygon
// This is the ERC-1155 contract that holds Yes/No tokens
const CTF_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

// Polymarket CTF Exchange contract - needs approval to transfer tokens
const POLYMARKET_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

// ERC-1155 ABI for setApprovalForAll and isApprovedForAll
const ERC1155_ABI = [
    'function setApprovalForAll(address operator, bool approved) external',
    'function isApprovedForAll(address account, address operator) external view returns (bool)',
    'function balanceOf(address account, uint256 id) external view returns (uint256)',
];

interface UseApproveCTFReturn {
    approveCTF: () => Promise<boolean>;
    checkApproval: (ownerAddress: string) => Promise<boolean>;
    checkTokenBalance: (ownerAddress: string, tokenId: string) => Promise<bigint>;
    isApproving: boolean;
    isApproved: boolean | null;
    error: string | null;
    txHash: string | null;
}

export function useApproveCTF(): UseApproveCTFReturn {
    const { authenticated } = usePrivy();
    const { wallets } = useWallets();
    const { sendTransaction } = useSendTransaction();
    const [isApproving, setIsApproving] = useState(false);
    const [isApproved, setIsApproved] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);

    /**
     * Check if CTF tokens are approved for the Exchange
     */
    const checkApproval = useCallback(async (ownerAddress: string): Promise<boolean> => {
        try {
            const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com');
            const ctf = new ethers.Contract(CTF_ADDRESS, ERC1155_ABI, provider);
            const approved = await ctf.isApprovedForAll(ownerAddress, POLYMARKET_EXCHANGE);
            setIsApproved(approved);
            return approved;
        } catch (err) {
            console.error('Error checking CTF approval:', err);
            return false;
        }
    }, []);

    /**
     * Check balance of a specific token ID
     */
    const checkTokenBalance = useCallback(async (ownerAddress: string, tokenId: string): Promise<bigint> => {
        try {
            const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com');
            const ctf = new ethers.Contract(CTF_ADDRESS, ERC1155_ABI, provider);
            const balance = await ctf.balanceOf(ownerAddress, tokenId);
            return balance;
        } catch (err) {
            console.error('Error checking token balance:', err);
            return BigInt(0);
        }
    }, []);

    /**
     * Approve CTF tokens for Polymarket exchange with Privy gas sponsorship
     * This enables selling of Yes/No tokens
     * Works directly with EOA wallet (no proxy wallet needed)
     */
    const approveCTF = useCallback(async (): Promise<boolean> => {
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
            console.log('Approving CTF tokens for Polymarket with gas sponsorship...');

            const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');

            if (!embeddedWallet) {
                throw new Error('Privy embedded wallet required for gas sponsorship.');
            }

            const ownerAddress = embeddedWallet.address;

            // Encode the setApprovalForAll function call
            const iface = new Interface(ERC1155_ABI);
            const callData = iface.encodeFunctionData('setApprovalForAll', [
                POLYMARKET_EXCHANGE,
                true,
            ]);

            // Send transaction directly to CTF contract using Privy's gas sponsorship
            const txResult = await sendTransaction(
                {
                    to: CTF_ADDRESS,
                    data: callData,
                    chainId: 137, // Polygon Mainnet
                },
                {
                    // Enable gas sponsorship from Privy
                    sponsor: true,
                    address: ownerAddress,
                }
            );

            console.log('Approve CTF transaction sent:', txResult.hash);
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
                throw new Error('CTF approval transaction failed or timed out');
            }

            console.log('CTF tokens approval confirmed!');
            setIsApproved(true);
            return true;
        } catch (err) {
            console.error('Error approving CTF tokens:', err);
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(`Failed to approve tokens for selling: ${errorMessage}`);
            return false;
        } finally {
            setIsApproving(false);
        }
    }, [authenticated, wallets, sendTransaction]);

    return {
        approveCTF,
        checkApproval,
        checkTokenBalance,
        isApproving,
        isApproved,
        error,
        txHash,
    };
}

export default useApproveCTF;
