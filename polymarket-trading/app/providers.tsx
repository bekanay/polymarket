'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { privyConfig, PRIVY_APP_ID, polygonChain } from '@/lib/privy/config';

interface ProvidersProps {
    children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
    return (
        <PrivyProvider
            appId={PRIVY_APP_ID}
            config={privyConfig}
        >
            {children}
        </PrivyProvider>
    );
}
