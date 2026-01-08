/**
 * ProxyWalletCard Component
 *
 * Displays and manages the user's Polymarket proxy wallet (Gnosis Safe).
 * Allows users to create a new proxy wallet with gas-sponsored transactions.
 * Supports funding the proxy wallet with USDC.
 */

'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useProxyWallet } from '@/hooks/useProxyWallet';
import { useFundProxyWallet } from '@/hooks/useFundProxyWallet';
import { useWallet } from '@/hooks/useWallet';

interface ProxyWalletCardProps {
    compact?: boolean;
}

export function ProxyWalletCard({ compact = false }: ProxyWalletCardProps) {
    const { authenticated, ready } = usePrivy();
    const {
        safeAddress,
        isDeployed,
        isLoading,
        isDeploying,
        error,
        balance,
        usdcBalance,
        txHash,
        deployProxyWallet,
        refreshBalances,
    } = useProxyWallet();

    const { usdcBalance: walletUsdcBalance } = useWallet();
    const {
        isFunding,
        error: fundError,
        txHash: fundTxHash,
        success: fundSuccess,
        fundProxyWallet,
        reset: resetFund,
        isExternalWallet,
    } = useFundProxyWallet();

    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showFundModal, setShowFundModal] = useState(false);
    const [fundAmount, setFundAmount] = useState('');

    // Refresh balances after successful funding
    useEffect(() => {
        if (fundSuccess) {
            refreshBalances();
        }
    }, [fundSuccess, refreshBalances]);

    // Don't render if not authenticated
    if (!ready || !authenticated) {
        return null;
    }

    // Handle balance refresh
    const handleRefresh = async () => {
        setIsRefreshing(true);
        await refreshBalances();
        setIsRefreshing(false);
    };

    // Copy address to clipboard
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    // Handle fund wallet
    const handleFundWallet = async () => {
        if (!safeAddress || !fundAmount) return;

        const success = await fundProxyWallet(safeAddress, fundAmount);
        if (success) {
            setFundAmount('');
            // Keep modal open to show success state
        }
    };

    // Close fund modal
    const handleCloseFundModal = () => {
        setShowFundModal(false);
        setFundAmount('');
        resetFund();
    };

    // Loading state
    if (isLoading) {
        return (
            <div className={`${compact ? 'p-3' : 'p-6'} bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50`}>
                <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-400">Checking proxy wallet...</span>
                </div>
            </div>
        );
    }

    // No proxy wallet yet - show create button
    if (!isDeployed || !safeAddress) {
        return (
            <div className={`${compact ? 'p-4' : 'p-6'} bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50`}>
                <div className="flex flex-col gap-4">
                    {/* Header */}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                            <span className="text-xl">🔒</span>
                        </div>
                        <div>
                            <h3 className="text-white font-semibold">Proxy Wallet</h3>
                            <p className="text-sm text-gray-400">Polymarket Trading Wallet</p>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/30">
                        <p className="text-sm text-gray-300 mb-3">
                            Create a Gnosis Safe proxy wallet to trade on Polymarket with gas-sponsored transactions.
                        </p>
                        <ul className="text-xs text-gray-400 space-y-1">
                            <li className="flex items-center gap-2">
                                <span className="text-green-400">✓</span>
                                Gas fees sponsored by Privy
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="text-green-400">✓</span>
                                Compatible with Polymarket CLOB
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="text-green-400">✓</span>
                                You remain the sole owner
                            </li>
                        </ul>
                    </div>

                    {/* Create Button */}
                    <button
                        onClick={deployProxyWallet}
                        disabled={isDeploying}
                        className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600
                                   hover:from-purple-500 hover:to-indigo-500 disabled:from-gray-600
                                   disabled:to-gray-600 text-white font-medium rounded-lg
                                   transition-all duration-200 flex items-center justify-center gap-2"
                    >
                        {isDeploying ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Creating Proxy Wallet...
                            </>
                        ) : (
                            <>
                                <span>🚀</span>
                                Create Proxy Wallet
                            </>
                        )}
                    </button>

                    {/* Gas Sponsorship Notice */}
                    <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3">
                        <div className="flex items-center gap-2">
                            <span className="text-green-400">⛽</span>
                            <span className="text-sm text-green-400">
                                Creation is free - gas sponsored by Privy
                            </span>
                        </div>
                    </div>

                    {/* Error Display */}
                    {error && (
                        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3">
                            <p className="text-sm text-red-400">{error}</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Has proxy wallet - show wallet info
    return (
        <>
            <div className={`${compact ? 'p-4' : 'p-6'} bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50`}>
                <div className="flex flex-col gap-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                                <span className="text-xl">🔒</span>
                            </div>
                            <div>
                                <h3 className="text-white font-semibold">Proxy Wallet</h3>
                                <p className="text-sm text-gray-400">Gnosis Safe</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-1 bg-green-900/30 text-green-400 text-xs rounded-full border border-green-700/30">
                                Active
                            </span>
                            <button
                                onClick={handleRefresh}
                                disabled={isRefreshing}
                                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
                                title="Refresh balances"
                            >
                                <svg
                                    className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Wallet Address */}
                    <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/30">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-500 uppercase tracking-wide">
                                Safe Address
                            </span>
                            <button
                                onClick={() => copyToClipboard(safeAddress)}
                                className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                            >
                                Copy
                            </button>
                        </div>
                        <p className="font-mono text-white text-sm break-all">{safeAddress}</p>
                        <a
                            href={`https://polygonscan.com/address/${safeAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-purple-400 hover:text-purple-300 mt-2 inline-block"
                        >
                            View on PolygonScan →
                        </a>
                    </div>

                    {/* Balances */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/30">
                            <span className="text-xs text-gray-500 uppercase tracking-wide block mb-1">
                                MATIC
                            </span>
                            <p className="text-lg font-semibold text-white">{balance || '0.0000'}</p>
                        </div>
                        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/30">
                            <span className="text-xs text-gray-500 uppercase tracking-wide block mb-1">
                                USDC
                            </span>
                            <p className="text-lg font-semibold text-white">
                                ${usdcBalance || '0.0000'}
                            </p>
                        </div>
                    </div>

                    {/* Fund Wallet Button */}
                    <button
                        onClick={() => setShowFundModal(true)}
                        className="w-full py-3 px-4 bg-gradient-to-r from-green-600 to-emerald-600
                                   hover:from-green-500 hover:to-emerald-500 text-white font-medium rounded-lg
                                   transition-all duration-200 flex items-center justify-center gap-2"
                    >
                        <span>💰</span>
                        Fund Wallet
                    </button>

                    {/* Info Notice */}
                    <div className="bg-purple-900/20 border border-purple-700/30 rounded-lg p-3">
                        <p className="text-xs text-purple-300">
                            Transfer USDC from your trading wallet. Gas fees are sponsored by Privy.
                        </p>
                    </div>

                    {/* Transaction Hash (if recently deployed) */}
                    {txHash && (
                        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/30">
                            <span className="text-xs text-gray-500 uppercase tracking-wide block mb-1">
                                Deployment TX
                            </span>
                            <a
                                href={`https://polygonscan.com/tx/${txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-purple-400 hover:text-purple-300 font-mono break-all"
                            >
                                {txHash.slice(0, 20)}...{txHash.slice(-8)}
                            </a>
                        </div>
                    )}

                    {/* Error Display */}
                    {error && (
                        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3">
                            <p className="text-sm text-red-400">{error}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Fund Wallet Modal */}
            {showFundModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 max-w-md w-full mx-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-white">Fund Proxy Wallet</h3>
                            <button
                                onClick={handleCloseFundModal}
                                className="text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        {fundSuccess ? (
                            <div className="text-center py-4">
                                <div className="text-4xl mb-3">✅</div>
                                <p className="text-green-400 font-medium mb-2">Transfer Successful!</p>
                                {fundTxHash && (
                                    <a
                                        href={`https://polygonscan.com/tx/${fundTxHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-purple-400 hover:text-purple-300"
                                    >
                                        View on PolygonScan →
                                    </a>
                                )}
                                <button
                                    onClick={handleCloseFundModal}
                                    className="w-full mt-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                                >
                                    Close
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="mb-4">
                                    <p className="text-sm text-gray-400 mb-2">
                                        Available in wallet: <span className="text-white font-medium">${walletUsdcBalance || '0.00'}</span>
                                    </p>
                                    <label className="block text-sm text-gray-400 mb-2">Amount (USDC)</label>
                                    <input
                                        type="number"
                                        value={fundAmount}
                                        onChange={(e) => setFundAmount(e.target.value)}
                                        placeholder="0.00"
                                        step="0.01"
                                        min="0"
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white
                                                   focus:outline-none focus:border-purple-500"
                                    />
                                </div>

                                {fundError && (
                                    <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 mb-4">
                                        <p className="text-sm text-red-400">{fundError}</p>
                                    </div>
                                )}

                                <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3 mb-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-green-400">⛽</span>
                                        <span className="text-sm text-green-400">
                                            Gas fees sponsored by Privy
                                        </span>
                                    </div>
                                </div>

                                <button
                                    onClick={handleFundWallet}
                                    disabled={isFunding || !fundAmount || parseFloat(fundAmount) <= 0}
                                    className="w-full py-3 px-4 bg-gradient-to-r from-green-600 to-emerald-600
                                               hover:from-green-500 hover:to-emerald-500 disabled:from-gray-600
                                               disabled:to-gray-600 text-white font-medium rounded-lg
                                               transition-all duration-200 flex items-center justify-center gap-2"
                                >
                                    {isFunding ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Transferring...
                                        </>
                                    ) : (
                                        <>
                                            <span>💰</span>
                                            Transfer USDC
                                        </>
                                    )}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

export default ProxyWalletCard;
