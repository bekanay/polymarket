/**
 * ProxyWallet Component
 * 
 * Displays proxy wallet status and provides wallet creation/management functionality.
 * Uses Gnosis Safe for secure wallet management with gas-sponsored transactions.
 */

'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useProxyWallet } from '@/hooks/useProxyWallet';

interface ProxyWalletProps {
    showFunding?: boolean;
    compact?: boolean;
}

export function ProxyWallet({ showFunding = true, compact = false }: ProxyWalletProps) {
    const { authenticated, ready } = usePrivy();
    const {
        proxyWalletAddress,
        isLoading,
        isCreating,
        error,
        balance,
        usdcBalance,
        hasProxyWallet,
        createProxyWallet,
        refreshBalance,
        refreshUsdcBalance,
    } = useProxyWallet();

    const [txHash, setTxHash] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Don't render if not authenticated
    if (!ready || !authenticated) {
        return null;
    }

    // Handle wallet creation
    const handleCreateWallet = async () => {
        setTxHash(null);
        const result = await createProxyWallet();
        if (result?.transactionHash) {
            setTxHash(result.transactionHash);
        }
    };

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

    // Truncate address for display
    const truncateAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
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

    // No proxy wallet - show creation UI
    if (!hasProxyWallet) {
        return (
            <div className={`${compact ? 'p-4' : 'p-6'} bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50`}>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex items-center justify-center">
                            <span className="text-xl">🔐</span>
                        </div>
                        <div>
                            <h3 className="text-white font-semibold">Proxy Wallet</h3>
                            <p className="text-sm text-gray-400">Create a secure trading wallet</p>
                        </div>
                    </div>

                    <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/30">
                        <p className="text-sm text-gray-300 mb-3">
                            A proxy wallet (Gnosis Safe) enables:
                        </p>
                        <ul className="text-sm text-gray-400 space-y-1.5">
                            <li className="flex items-center gap-2">
                                <span className="text-green-400">✓</span> Gas-sponsored transactions
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="text-green-400">✓</span> Secure multi-sig protection
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="text-green-400">✓</span> Isolated trading funds
                            </li>
                        </ul>
                    </div>

                    {error && (
                        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3">
                            <p className="text-sm text-red-400">{error}</p>
                        </div>
                    )}

                    <button
                        onClick={handleCreateWallet}
                        disabled={isCreating}
                        className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-gray-600 disabled:to-gray-600 text-white font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
                    >
                        {isCreating ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Creating Wallet...
                            </>
                        ) : (
                            <>
                                <span>🚀</span>
                                Create Proxy Wallet
                            </>
                        )}
                    </button>

                    {isCreating && (
                        <p className="text-xs text-center text-gray-500">
                            This may take a moment. Please confirm the transaction in your wallet.
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // Has proxy wallet - show wallet info
    return (
        <div className={`${compact ? 'p-4' : 'p-6'} bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50`}>
            <div className="flex flex-col gap-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                            <span className="text-xl">✓</span>
                        </div>
                        <div>
                            <h3 className="text-white font-semibold">Proxy Wallet</h3>
                            <p className="text-sm text-gray-400">Gnosis Safe</p>
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
                            onClick={() => copyToClipboard(proxyWalletAddress!)}
                            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                            Copy
                        </button>
                    </div>
                    <p className="font-mono text-white text-sm break-all">
                        {proxyWalletAddress}
                    </p>
                    <a
                        href={`https://polygonscan.com/address/${proxyWalletAddress}`}
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

                {/* Transaction Hash (if just created) */}
                {txHash && (
                    <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3">
                        <p className="text-sm text-green-400 mb-1">✓ Wallet created successfully!</p>
                        <a
                            href={`https://polygonscan.com/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-green-300 hover:text-green-200"
                        >
                            View transaction: {truncateAddress(txHash)} →
                        </a>
                    </div>
                )}

                {/* Funding Section */}
                {showFunding && (
                    <div className="border-t border-gray-700/50 pt-4 mt-2">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-white">Fund Wallet</span>
                            <span className="text-xs text-gray-500">Send USDC to trade</span>
                        </div>
                        <div className="bg-gray-900/30 rounded-lg p-3 border border-dashed border-gray-600">
                            <p className="text-xs text-gray-400 text-center">
                                Send MATIC or USDC to your proxy wallet address above to start trading.
                            </p>
                            <button
                                onClick={() => copyToClipboard(proxyWalletAddress!)}
                                className="w-full mt-3 py-2 px-3 bg-gray-700/50 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <span>📋</span>
                                Copy Address
                            </button>
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

export default ProxyWallet;
