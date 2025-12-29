import type { PrivyClientConfig } from '@privy-io/react-auth';

// Polygon Mainnet chain configuration
export const polygonMainnet = {
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

// Polygon Amoy Testnet configuration (for testing)
export const polygonAmoy = {
    id: 80002,
    name: 'Polygon Amoy',
    network: 'polygon-amoy',
    nativeCurrency: {
        decimals: 18,
        name: 'MATIC',
        symbol: 'MATIC',
    },
    rpcUrls: {
        default: {
            http: ['https://rpc-amoy.polygon.technology'],
        },
        public: {
            http: ['https://rpc-amoy.polygon.technology'],
        },
    },
    blockExplorers: {
        default: { name: 'OKLink', url: 'https://www.oklink.com/amoy' },
    },
};

// Ethereum Mainnet (needed for Privy on-ramp)
export const ethereumMainnet = {
    id: 1,
    name: 'Ethereum',
    network: 'ethereum',
    nativeCurrency: {
        decimals: 18,
        name: 'Ether',
        symbol: 'ETH',
    },
    rpcUrls: {
        default: {
            http: ['https://eth.llamarpc.com'],
        },
        public: {
            http: ['https://eth.llamarpc.com'],
        },
    },
    blockExplorers: {
        default: { name: 'Etherscan', url: 'https://etherscan.io' },
    },
};

// Always use mainnet for now (user has existing wallet and funds on mainnet)
// To switch to testnet, change this to polygonAmoy
export const polygonChain = polygonMainnet;

// Privy configuration
export const privyConfig: PrivyClientConfig = {
    loginMethods: ['email', 'wallet', 'google'],
    appearance: {
        theme: 'dark',
        accentColor: '#676FFF',
        // Logo can be added later in public/polymarket-logo.png
    },
    embeddedWallets: {
        ethereum: {
            createOnLogin: 'users-without-wallets',
        },
    },
    defaultChain: polygonChain,
    // Include Ethereum for on-ramp, Polygon for trading
    supportedChains: [polygonChain, ethereumMainnet],
};

// Export the app ID for use in provider
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';
