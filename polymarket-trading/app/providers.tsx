'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets';
import { privyConfig, PRIVY_APP_ID } from '@/lib/privy/config';
import { useLogoutCleanup } from '@/hooks/useLogoutCleanup';

interface ProvidersProps {
    children: React.ReactNode;
}

// Inner component that can use Privy hooks
function LogoutCleanupProvider({ children }: { children: React.ReactNode }) {
    useLogoutCleanup();
    return <>{children}</>;
}

export function Providers({ children }: ProvidersProps) {
    return (
        <PrivyProvider
            appId={PRIVY_APP_ID}
            config={privyConfig}
        >
            <SmartWalletsProvider>
                <LogoutCleanupProvider>
                    {children}
                </LogoutCleanupProvider>
            </SmartWalletsProvider>
        </PrivyProvider>
    );
}
