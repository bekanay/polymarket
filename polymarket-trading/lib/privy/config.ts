import type { PrivyClientConfig } from '@privy-io/react-auth';

// Polygon Mainnet chain configuration
export const polygonChain = {
    id: 137,
    name: 'Polygon',
    network: 'matic',
    nativeCurrency: {
        decimals: 18,
        name: 'MATIC',
        symbol: 'MATIC',
    },
    rpcUrls: {
        default: {
            http: [process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com'],
        },
        public: {
            http: ['https://polygon-rpc.com'],
        },
    },
    blockExplorers: {
        default: { name: 'PolygonScan', url: 'https://polygonscan.com' },
    },
};

// Privy configuration
export const privyConfig: PrivyClientConfig = {
    loginMethods: ['email', 'wallet', 'google'],
    appearance: {
        theme: 'dark',
        accentColor: '#676FFF',
        logo: '/polymarket-logo.png', // Add logo to public folder
    },
    embeddedWallets: {
        createOnLogin: 'users-without-wallets',
    },
    defaultChain: polygonChain,
    supportedChains: [polygonChain],
};

// Export the app ID for use in provider
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';
