'use client';

import { usePrivy } from '@privy-io/react-auth';

export function DisconnectButton() {
    const { ready, authenticated, logout } = usePrivy();

    if (!ready || !authenticated) {
        return null;
    }

    return (
        <button
            onClick={logout}
            className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg 
                 hover:bg-red-500/20 hover:border-red-500/50 transition-all duration-200
                 text-sm font-medium"
        >
            Disconnect
        </button>
    );
}
