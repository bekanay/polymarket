/**
 * WalletCard Component
 * 
 * Displays user's wallet status and balances.
 * Detects wallet type and shows appropriate UI:
 * - MetaMask → shows MetaMask wallet
 * - Email/Google → shows embedded Privy wallet
 */

'use client';

import { useState } from 'react';
import { usePrivy, useWallets, useFundWallet } from '@privy-io/react-auth';
import { useWallet } from '@/hooks/useWallet';
import { polygon } from 'viem/chains';

interface WalletCardProps {
    compact?: boolean;
}

export function WalletCard({ compact = false }: WalletCardProps) {
    const { authenticated, ready } = usePrivy();
    const { wallets } = useWallets();
    const { fundWallet } = useFundWallet();
    const {
        walletAddress,
        isLoading,
        error,
        balance,
        usdcBalance,
        hasWallet,
        isEmbeddedWallet,
        walletType,
        refreshBalance,
        refreshUsdcBalance,
    } = useWallet();

    const [isRefreshing, setIsRefreshing] = useState(false);

    // Get the embedded wallet (for funding only)
    const embeddedWallet = wallets.find(
        wallet => wallet.walletClientType === 'privy'
    );

    // Don't render if not authenticated
    if (!ready || !authenticated) {
        return null;
    }

    // Handle balance refresh
    const handleRefresh = async () => {
        setIsRefreshing(true);
        await Promise.all([refreshBalance(), refreshUsdcBalance()]);
        setIsRefreshing(false);
    };

    // Copy address to clipboard
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    // Loading state
    if (isLoading) {
        return (
            <div className={`${compact ? 'p-3' : 'p-6'} bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50`}>
                <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-400">Loading wallet...</span>
                </div>
            </div>
        );
    }

    // No wallet yet
    if (!hasWallet || !walletAddress) {
        return (
            <div className={`${compact ? 'p-4' : 'p-6'} bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50`}>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex items-center justify-center">
                            <span className="text-xl">🔐</span>
                        </div>
                        <div>
                            <h3 className="text-white font-semibold">Wallet</h3>
                            <p className="text-sm text-gray-400">No wallet connected</p>
                        </div>
                    </div>
                    <p className="text-sm text-gray-400">
                        Please log in with email, Google, or connect your wallet.
                    </p>
                </div>
            </div>
        );
    }

    // Determine wallet display info
    const walletLabel = isEmbeddedWallet ? 'Privy Embedded' : 'MetaMask';
    const walletIcon = isEmbeddedWallet ? '🔐' : '🦊';

    // Has wallet - show wallet info
    return (
        <div className={`${compact ? 'p-4' : 'p-6'} bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50`}>
            <div className="flex flex-col gap-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 bg-gradient-to-br ${isEmbeddedWallet ? 'from-green-500 to-emerald-600' : 'from-orange-500 to-amber-600'} rounded-lg flex items-center justify-center`}>
                            <span className="text-xl">{walletIcon}</span>
                        </div>
                        <div>
                            <h3 className="text-white font-semibold">Trading Wallet</h3>
                            <p className="text-sm text-gray-400">{walletLabel}</p>
                        </div>
                    </div>
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
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                {/* Wallet Address */}
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/30">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500 uppercase tracking-wide">Address</span>
                        <button
                            onClick={() => copyToClipboard(walletAddress)}
                            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                            Copy
                        </button>
                    </div>
                    <p className="font-mono text-white text-sm break-all">
                        {walletAddress}
                    </p>
                    <a
                        href={`https://polygonscan.com/address/${walletAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-400 hover:text-indigo-300 mt-2 inline-block"
                    >
                        View on PolygonScan →
                    </a>
                </div>

                {/* Balances */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/30">
                        <span className="text-xs text-gray-500 uppercase tracking-wide block mb-1">MATIC</span>
                        <p className="text-lg font-semibold text-white">
                            {balance || '0.0000'}
                        </p>
                    </div>
                    <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/30">
                        <span className="text-xs text-gray-500 uppercase tracking-wide block mb-1">USDC</span>
                        <p className="text-lg font-semibold text-white">
                            ${usdcBalance || '0.0000'}
                        </p>
                    </div>
                </div>

                {/* Fund Wallet Button - only for embedded wallets */}
                {isEmbeddedWallet && embeddedWallet && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => fundWallet({
                                address: embeddedWallet.address,
                                options: {
                                    defaultFundingMethod: 'card',
                                    asset: 'USDC',
                                    chain: polygon,
                                }
                            })}
                            className="flex-1 py-3 px-4 bg-gradient-to-r from-green-600 to-emerald-600 
                                       hover:from-green-500 hover:to-emerald-500 text-white font-medium 
                                       rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
                        >
                            <span>💵</span>
                            Buy USDC
                        </button>
                        <button
                            onClick={() => copyToClipboard(walletAddress)}
                            className="py-3 px-4 bg-gray-700/50 hover:bg-gray-700 text-white 
                                       rounded-lg transition-colors flex items-center justify-center gap-2"
                            title="Copy address to receive crypto"
                        >
                            <span>📋</span>
                            Copy
                        </button>
                    </div>
                )}

                {/* External wallet - just show copy button */}
                {!isEmbeddedWallet && (
                    <button
                        onClick={() => copyToClipboard(walletAddress)}
                        className="w-full py-3 px-4 bg-gray-700/50 hover:bg-gray-700 text-white 
                                   rounded-lg transition-colors flex items-center justify-center gap-2"
                        title="Copy address to receive crypto"
                    >
                        <span>📋</span>
                        Copy Address
                    </button>
                )}

                {/* Gas Sponsorship Notice */}
                {isEmbeddedWallet ? (
                    <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3">
                        <div className="flex items-center gap-2">
                            <span className="text-green-400">⛽</span>
                            <span className="text-sm text-green-400">Gas fees are sponsored by Privy</span>
                        </div>
                    </div>
                ) : (
                    <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
                        <div className="flex items-center gap-2">
                            <span className="text-yellow-400">⚠️</span>
                            <span className="text-sm text-yellow-400">External wallet - you pay gas fees</span>
                        </div>
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
    );
}

export default WalletCard;
