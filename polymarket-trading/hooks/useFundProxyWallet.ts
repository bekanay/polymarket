/**
 * useFundProxyWallet Hook
 *
 * Handles gas-sponsored USDC transfer from user's wallet to their Gnosis Safe proxy wallet.
 * Uses Privy's sendTransaction with sponsor: true for gasless transactions.
 * Works with both embedded wallets and external wallets (MetaMask).
 */

'use client';

import { useState, useCallback } from 'react';
import { useWallets, useSendTransaction } from '@privy-io/react-auth';
import { ethers } from 'ethers';

// USDC contract on Polygon (Bridged USDC.e - used by Polymarket)
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_DECIMALS = 6;
const POLYGON_CHAIN_ID = 137;

// Minimal ABI for ERC-20 transfer
const ERC20_TRANSFER_ABI = ['function transfer(address to, uint256 amount) returns (bool)'];

interface UseFundProxyWalletState {
    isFunding: boolean;
    error: string | null;
    txHash: string | null;
    success: boolean;
}

interface UseFundProxyWalletReturn extends UseFundProxyWalletState {
    fundProxyWallet: (safeAddress: string, amount: string) => Promise<boolean>;
    reset: () => void;
    isExternalWallet: boolean;
}

/**
 * Hook to fund proxy wallet with USDC using gas-sponsored transactions
 * Privy's gas sponsorship works with both embedded and external wallets
 */
export function useFundProxyWallet(): UseFundProxyWalletReturn {
    const { wallets } = useWallets();
    const { sendTransaction } = useSendTransaction();

    const [state, setState] = useState<UseFundProxyWalletState>({
        isFunding: false,
        error: null,
        txHash: null,
        success: false,
    });

    // Check if user is using an external wallet (MetaMask)
    const isExternalWallet = wallets.some(w => w.walletClientType !== 'privy');

    /**
     * Fund the proxy wallet with USDC
     * @param safeAddress - The Gnosis Safe address to fund
     * @param amount - Amount of USDC to transfer (human readable, e.g., "10.50")
     * @returns true if successful, false otherwise
     */
    const fundProxyWallet = useCallback(
        async (safeAddress: string, amount: string): Promise<boolean> => {
            if (!safeAddress || !amount) {
                setState(prev => ({ ...prev, error: 'Invalid parameters' }));
                return false;
            }

            // Validate amount
            const parsedAmount = parseFloat(amount);
            if (isNaN(parsedAmount) || parsedAmount <= 0) {
                setState(prev => ({ ...prev, error: 'Invalid amount' }));
                return false;
            }

            // Get the active wallet to switch chain
            const activeWallet = wallets[0];
            if (!activeWallet) {
                setState(prev => ({ ...prev, error: 'No wallet connected' }));
                return false;
            }

            setState({
                isFunding: true,
                error: null,
                txHash: null,
                success: false,
            });

            try {
                // Convert amount to wei (USDC has 6 decimals)
                const amountInWei = ethers.parseUnits(amount, USDC_DECIMALS);

                // Encode the transfer function call
                const erc20Interface = new ethers.Interface(ERC20_TRANSFER_ABI);
                const transferData = erc20Interface.encodeFunctionData('transfer', [
                    safeAddress,
                    amountInWei,
                ]);

                console.log('Funding proxy wallet (gas-sponsored):', {
                    from: activeWallet.address,
                    to: USDC_ADDRESS,
                    safeAddress,
                    amount,
                    amountInWei: amountInWei.toString(),
                });

                // Switch to Polygon if needed
                await activeWallet.switchChain(POLYGON_CHAIN_ID);

                // Send gas-sponsored transaction using Privy
                // This works with both embedded AND external wallets
                const txReceipt = await sendTransaction(
                    {
                        to: USDC_ADDRESS,
                        data: transferData as `0x${string}`,
                        value: BigInt(0),
                        chainId: POLYGON_CHAIN_ID,
                    },
                    { sponsor: true }
                );

                console.log('Fund transaction successful:', txReceipt);

                setState({
                    isFunding: false,
                    error: null,
                    txHash: txReceipt.hash,
                    success: true,
                });

                return true;
            } catch (error) {
                console.error('Error funding proxy wallet:', error);
                setState({
                    isFunding: false,
                    error: error instanceof Error ? error.message : 'Failed to fund proxy wallet',
                    txHash: null,
                    success: false,
                });
                return false;
            }
        },
        [wallets, sendTransaction]
    );

    /**
     * Reset the state
     */
    const reset = useCallback(() => {
        setState({
            isFunding: false,
            error: null,
            txHash: null,
            success: false,
        });
    }, []);

    return {
        ...state,
        fundProxyWallet,
        reset,
        isExternalWallet,
    };
}

export default useFundProxyWallet;
