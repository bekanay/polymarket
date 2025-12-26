/**
 * FundWallet Component
 * 
 * Allows users to transfer USDC from their embedded Privy wallet to their proxy wallet.
 * Uses Privy's gas sponsorship for transfers.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { BrowserProvider, Contract, parseUnits, formatUnits } from 'ethers';

// USDC contract address on Polygon Mainnet
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_DECIMALS = 6;

// Minimal ERC20 ABI for transfers
const ERC20_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address owner) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
];

interface FundWalletProps {
    proxyWalletAddress: string | null;
    onFundingComplete?: (txHash: string) => void;
    onBalanceUpdate?: () => void;
}

type TransactionStatus = 'idle' | 'preparing' | 'pending' | 'success' | 'error';

export function FundWallet({
    proxyWalletAddress,
    onFundingComplete,
    onBalanceUpdate
}: FundWalletProps) {
    const { authenticated, ready } = usePrivy();
    const { wallets } = useWallets();

    const [amount, setAmount] = useState<string>('');
    const [embeddedBalance, setEmbeddedBalance] = useState<string>('0');
    const [status, setStatus] = useState<TransactionStatus>('idle');
    const [txHash, setTxHash] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingBalance, setIsLoadingBalance] = useState(true);

    // Get the embedded wallet
    const embeddedWallet = wallets.find(
        wallet => wallet.walletClientType === 'privy'
    );

    // Fetch embedded wallet USDC balance
    const fetchEmbeddedBalance = useCallback(async () => {
        if (!embeddedWallet) {
            setIsLoadingBalance(false);
            return;
        }

        try {
            setIsLoadingBalance(true);
            const ethereumProvider = await embeddedWallet.getEthereumProvider();
            const provider = new BrowserProvider(ethereumProvider);
            const usdcContract = new Contract(USDC_ADDRESS, ERC20_ABI, provider);
            const balance = await usdcContract.balanceOf(embeddedWallet.address);
            setEmbeddedBalance(formatUnits(balance, USDC_DECIMALS));
        } catch (err) {
            console.error('Error fetching embedded wallet balance:', err);
            setEmbeddedBalance('0');
        } finally {
            setIsLoadingBalance(false);
        }
    }, [embeddedWallet]);

    // Fetch balance on mount and when wallet changes
    useEffect(() => {
        if (ready && authenticated && embeddedWallet) {
            fetchEmbeddedBalance();
        }
    }, [ready, authenticated, embeddedWallet, fetchEmbeddedBalance]);

    // Handle max button
    const handleMax = () => {
        setAmount(embeddedBalance);
    };

    // Format amount for display
    const formatDisplayAmount = (value: string) => {
        const num = parseFloat(value);
        if (isNaN(num)) return '0.00';
        return num.toFixed(2);
    };

    // Validate amount
    const isValidAmount = () => {
        const numAmount = parseFloat(amount);
        const numBalance = parseFloat(embeddedBalance);
        return !isNaN(numAmount) && numAmount > 0 && numAmount <= numBalance;
    };

    // Handle transfer
    const handleTransfer = async () => {
        if (!embeddedWallet || !proxyWalletAddress || !isValidAmount()) {
            return;
        }

        setStatus('preparing');
        setError(null);
        setTxHash(null);

        try {
            // Get signer from embedded wallet
            const ethereumProvider = await embeddedWallet.getEthereumProvider();
            const provider = new BrowserProvider(ethereumProvider);
            const signer = await provider.getSigner();

            // Create USDC contract instance
            const usdcContract = new Contract(USDC_ADDRESS, ERC20_ABI, signer);

            // Parse amount to USDC units (6 decimals)
            const amountInUnits = parseUnits(amount, USDC_DECIMALS);

            setStatus('pending');

            // Execute transfer
            // Privy will sponsor gas if configured
            const tx = await usdcContract.transfer(proxyWalletAddress, amountInUnits);

            setTxHash(tx.hash);

            // Wait for confirmation
            await tx.wait();

            setStatus('success');
            setAmount('');

            // Callback on success
            if (onFundingComplete) {
                onFundingComplete(tx.hash);
            }

            // Refresh balances
            await fetchEmbeddedBalance();
            if (onBalanceUpdate) {
                onBalanceUpdate();
            }

        } catch (err: unknown) {
            console.error('Transfer error:', err);
            setStatus('error');

            // Extract error message
            if (err instanceof Error) {
                if (err.message.includes('user rejected')) {
                    setError('Transaction was rejected');
                } else if (err.message.includes('insufficient')) {
                    setError('Insufficient funds for transfer');
                } else {
                    setError(err.message.slice(0, 100));
                }
            } else {
                setError('Transfer failed. Please try again.');
            }
        }
    };

    // Don't render if not authenticated or no proxy wallet
    if (!ready || !authenticated || !proxyWalletAddress) {
        return null;
    }

    // No embedded wallet
    if (!embeddedWallet) {
        return (
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-lg flex items-center justify-center">
                        <span className="text-xl">💳</span>
                    </div>
                    <div>
                        <h3 className="text-white font-semibold">Fund Proxy Wallet</h3>
                        <p className="text-sm text-gray-400">Transfer USDC to your trading wallet</p>
                    </div>
                </div>
                <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4">
                    <p className="text-sm text-yellow-400">
                        No embedded wallet found. Please log in with email or Google to create an embedded wallet.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                    <span className="text-xl">💳</span>
                </div>
                <div>
                    <h3 className="text-white font-semibold">Fund Proxy Wallet</h3>
                    <p className="text-sm text-gray-400">Transfer USDC for trading</p>
                </div>
            </div>

            {/* Embedded Wallet Balance */}
            <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/30 mb-4">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Your Wallet Balance</span>
                    <button
                        onClick={fetchEmbeddedBalance}
                        disabled={isLoadingBalance}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                        {isLoadingBalance ? 'Loading...' : 'Refresh'}
                    </button>
                </div>
                <p className="text-2xl font-bold text-white mt-1">
                    ${formatDisplayAmount(embeddedBalance)}
                    <span className="text-sm font-normal text-gray-400 ml-2">USDC</span>
                </p>
                <p className="text-xs text-gray-500 mt-1 font-mono">
                    {embeddedWallet.address.slice(0, 10)}...{embeddedWallet.address.slice(-8)}
                </p>
            </div>

            {/* Amount Input */}
            <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Amount to Transfer</label>
                <div className="relative">
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        disabled={status === 'pending' || status === 'preparing'}
                        className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg px-4 py-3 pr-20 text-white text-lg 
                                   placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        <button
                            onClick={handleMax}
                            disabled={status === 'pending' || status === 'preparing'}
                            className="px-2 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-400 text-xs rounded
                                       transition-colors disabled:opacity-50"
                        >
                            MAX
                        </button>
                        <span className="text-gray-400 text-sm">USDC</span>
                    </div>
                </div>
                {parseFloat(amount) > parseFloat(embeddedBalance) && amount !== '' && (
                    <p className="text-xs text-red-400 mt-1">Insufficient balance</p>
                )}
            </div>

            {/* Transfer Arrow */}
            <div className="flex items-center justify-center my-4">
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <span>↓</span>
                    <span>to Proxy Wallet</span>
                    <span>↓</span>
                </div>
            </div>

            {/* Proxy Wallet (Destination) */}
            <div className="bg-gray-900/30 rounded-lg p-3 border border-dashed border-gray-600 mb-4">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Destination</span>
                    <span className="text-xs text-green-400">Gnosis Safe</span>
                </div>
                <p className="text-sm font-mono text-gray-300 mt-1">
                    {proxyWalletAddress.slice(0, 14)}...{proxyWalletAddress.slice(-12)}
                </p>
            </div>

            {/* Gas Sponsorship Notice */}
            <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-green-400">⛽</span>
                    <span className="text-sm text-green-400">Gas fees are sponsored by Privy</span>
                </div>
            </div>

            {/* Error Message */}
            {error && status === 'error' && (
                <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 mb-4">
                    <p className="text-sm text-red-400">{error}</p>
                </div>
            )}

            {/* Success Message */}
            {status === 'success' && txHash && (
                <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3 mb-4">
                    <p className="text-sm text-green-400 mb-1">✓ Transfer successful!</p>
                    <a
                        href={`https://polygonscan.com/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-green-300 hover:text-green-200"
                    >
                        View transaction →
                    </a>
                </div>
            )}

            {/* Transfer Button */}
            <button
                onClick={handleTransfer}
                disabled={!isValidAmount() || status === 'pending' || status === 'preparing'}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 
                           hover:from-blue-500 hover:to-indigo-500 
                           disabled:from-gray-600 disabled:to-gray-600 
                           text-white font-medium rounded-lg transition-all duration-200 
                           flex items-center justify-center gap-2"
            >
                {status === 'preparing' ? (
                    <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Preparing...
                    </>
                ) : status === 'pending' ? (
                    <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Transferring...
                    </>
                ) : (
                    <>
                        <span>💸</span>
                        Fund Proxy Wallet
                    </>
                )}
            </button>

            {/* Pending Transaction Hash */}
            {status === 'pending' && txHash && (
                <p className="text-xs text-center text-gray-500 mt-2">
                    Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </p>
            )}
        </div>
    );
}

export default FundWallet;
