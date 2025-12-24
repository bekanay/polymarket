'use client';

import { usePrivy } from '@privy-io/react-auth';

export function LoginButton() {
    const { login, ready, authenticated } = usePrivy();

    if (!ready) {
        return (
            <button
                disabled
                className="px-6 py-3 bg-gray-600 text-gray-400 rounded-lg cursor-not-allowed"
            >
                Loading...
            </button>
        );
    }

    if (authenticated) {
        return null;
    }

    return (
        <button
            onClick={login}
            className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-lg 
                 hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 
                 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
        >
            Connect Wallet
        </button>
    );
}
