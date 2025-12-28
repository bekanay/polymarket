/**
 * useLogoutCleanup Hook
 * 
 * Automatically clears CLOB credentials when user logs out.
 * Add this hook to your app's root component.
 */

'use client';

import { useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { clearAllCredentials } from '@/lib/polymarket/clobClient';

export function useLogoutCleanup() {
    const { authenticated, ready } = usePrivy();
    const wasAuthenticated = useRef(false);

    useEffect(() => {
        if (!ready) return;

        // Track authentication state changes
        if (wasAuthenticated.current && !authenticated) {
            // User just logged out
            console.log('User logged out - clearing credentials');
            clearAllCredentials();
        }

        wasAuthenticated.current = authenticated;
    }, [authenticated, ready]);
}

export default useLogoutCleanup;
