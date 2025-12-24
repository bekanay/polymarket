'use client';

import { usePrivy } from '@privy-io/react-auth';

export function WalletInfo() {
    const { ready, authenticated, user } = usePrivy();

    if (!ready || !authenticated || !user) {
        return null;
    }

    // Get wallet address from user object
    const walletAddress = user.wallet?.address;

    // Truncate address for display
    const truncatedAddress = walletAddress
        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
        : 'No wallet';

    return (
        <div className="flex items-center gap-3 px-4 py-2 bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <div className="flex flex-col">
                <span className="text-xs text-gray-400">Connected</span>
                <span className="text-sm font-mono text-white">{truncatedAddress}</span>
            </div>
            {user.email && (
                <span className="text-xs text-gray-500 hidden sm:block">
                    {user.email.address}
                </span>
            )}
        </div>
    );
}
