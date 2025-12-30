/**
 * useApproveCTF Hook
 * 
 * Handles Conditional Token approval for Polymarket exchange.
 * Required for SELLING positions (Yes/No tokens).
 * Uses wallet provider directly for the transaction.
 */

'use client';

import { useState, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ethers, Interface, BrowserProvider } from 'ethers';

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
     * Approve CTF tokens for Polymarket exchange via wallet provider
     * This enables selling of Yes/No tokens
     */
    const approveCTF = useCallback(async (): Promise<boolean> => {
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
            console.log('Approving CTF tokens for Polymarket selling...');
            console.log('Using wallet:', connectedWallet.address, 'type:', connectedWallet.walletClientType);

            // Get the wallet's Ethereum provider
            const ethereumProvider = await connectedWallet.getEthereumProvider();

            // Send setApprovalForAll transaction
            console.log('Sending setApprovalForAll transaction...');

            const hash = await ethereumProvider.request({
                method: 'eth_sendTransaction',
                params: [{
                    from: connectedWallet.address,
                    to: CTF_ADDRESS,
                    data: new Interface(ERC1155_ABI).encodeFunctionData('setApprovalForAll', [
                        POLYMARKET_EXCHANGE,
                        true
                    ]),
                }],
            }) as string;

            console.log('Approve CTF transaction sent:', hash);
            setTxHash(hash);

            // Wait for confirmation using public RPC
            console.log('Waiting for confirmation...');
            const publicProvider = new ethers.JsonRpcProvider('https://polygon-rpc.com');

            let receipt = null;
            for (let i = 0; i < 30; i++) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                receipt = await publicProvider.getTransactionReceipt(hash);
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
    }, [authenticated, wallets]);

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
