import { PrivyClient } from '@privy-io/server-auth';

let privyClientInstance: PrivyClient | null = null;

/**
 * Creates or returns a singleton Privy server client
 * Uses environment variables for configuration
 */
export function getPrivyClient(): PrivyClient {
    if (privyClientInstance) {
        return privyClientInstance;
    }

    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    const authorizationPrivateKey = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY;

    if (!appId || !appSecret) {
        throw new Error(
            'Missing Privy configuration: NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET are required'
        );
    }

    privyClientInstance = new PrivyClient(appId, appSecret, {
        walletApi: {
            authorizationPrivateKey: authorizationPrivateKey,
        },
    });

    return privyClientInstance;
}

/**
 * Reset the Privy client instance (useful for testing)
 */
export function resetPrivyClient(): void {
    privyClientInstance = null;
}
