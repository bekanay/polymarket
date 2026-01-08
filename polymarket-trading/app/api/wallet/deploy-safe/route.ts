import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import {
    deploySafeWithPrivy,
    deterministicSaltNonce,
    getSafeAddressIfDeployed,
    SAFE_CONSTANTS,
} from '@/lib/wallet/safeDeployment';
import { getPrivyClient } from '@/lib/privy/server';

interface DeploySafeRequest {
    userEoaAddress: string;
    privyUserId?: string; // Privy user DID to get their embedded wallet
    privyWalletId?: string; // Or directly pass the wallet ID
    useDeterministicSalt?: boolean;
    saltIndex?: number;
}

interface DeploySafeResponse {
    success: boolean;
    safeAddress?: string;
    txHash?: string;
    alreadyDeployed?: boolean;
    sponsored?: boolean;
    error?: string;
}

/**
 * Gets the user's Privy embedded wallet ID
 */
async function getUserEmbeddedWalletId(privyUserId: string): Promise<string | null> {
    const privy = getPrivyClient();

    try {
        const user = await privy.getUserById(privyUserId);

        // Find the embedded wallet (walletClientType === 'privy')
        const embeddedWallet = user.linkedAccounts.find(
            (account) =>
                account.type === 'wallet' &&
                'walletClientType' in account &&
                account.walletClientType === 'privy' &&
                'id' in account &&
                account.id
        );

        if (embeddedWallet && 'id' in embeddedWallet && embeddedWallet.id) {
            return embeddedWallet.id;
        }

        return null;
    } catch (error) {
        console.error('Failed to get user embedded wallet:', error);
        return null;
    }
}

export async function POST(request: NextRequest): Promise<NextResponse<DeploySafeResponse>> {
    try {
        const body: DeploySafeRequest = await request.json();
        const {
            userEoaAddress,
            privyUserId,
            privyWalletId,
            useDeterministicSalt = true,
            saltIndex = 0,
        } = body;

        // Validate input
        if (!userEoaAddress) {
            return NextResponse.json(
                { success: false, error: 'userEoaAddress is required' },
                { status: 400 }
            );
        }

        if (!privyUserId && !privyWalletId) {
            return NextResponse.json(
                { success: false, error: 'Either privyUserId or privyWalletId is required' },
                { status: 400 }
            );
        }

        if (!ethers.isAddress(userEoaAddress)) {
            return NextResponse.json(
                { success: false, error: 'Invalid Ethereum address' },
                { status: 400 }
            );
        }

        const normalizedAddress = ethers.getAddress(userEoaAddress);

        // Generate salt nonce
        const saltNonce = useDeterministicSalt
            ? deterministicSaltNonce(normalizedAddress, saltIndex)
            : BigInt(Date.now());

        // Check if Safe already exists
        const rpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
        const provider = new ethers.JsonRpcProvider(rpcUrl);

        const existingSafe = await getSafeAddressIfDeployed(
            provider,
            normalizedAddress,
            saltNonce
        );

        if (existingSafe) {
            return NextResponse.json({
                success: true,
                safeAddress: existingSafe,
                alreadyDeployed: true,
                sponsored: false,
            });
        }

        // Determine which wallet to use
        let walletId = privyWalletId;

        if (!walletId && privyUserId) {
            // Get user's embedded wallet ID
            const embeddedWalletId = await getUserEmbeddedWalletId(privyUserId);

            if (!embeddedWalletId) {
                return NextResponse.json(
                    {
                        success: false,
                        error: 'User does not have a Privy embedded wallet with delegation enabled',
                    },
                    { status: 400 }
                );
            }
            walletId = embeddedWalletId;
        }

        if (!walletId) {
            return NextResponse.json(
                { success: false, error: 'No wallet available for deployment' },
                { status: 400 }
            );
        }

        // Deploy Safe with Privy gas sponsorship
        const result = await deploySafeWithPrivy(walletId, {
            userEoaAddress: normalizedAddress,
            saltNonce,
        });

        console.log(`Safe deployed with Privy sponsorship for ${normalizedAddress}:`, {
            safeAddress: result.safeAddress,
            txHash: result.txHash,
            walletId,
        });

        return NextResponse.json({
            success: true,
            safeAddress: result.safeAddress,
            txHash: result.txHash,
            alreadyDeployed: false,
            sponsored: true,
        });
    } catch (error) {
        console.error('Safe deployment error:', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('already deployed')) {
            return NextResponse.json(
                { success: false, error: errorMessage },
                { status: 409 }
            );
        }

        return NextResponse.json(
            { success: false, error: `Deployment failed: ${errorMessage}` },
            { status: 500 }
        );
    }
}

// GET endpoint to check Safe deployment status
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const { searchParams } = new URL(request.url);
        const userEoaAddress = searchParams.get('userEoaAddress');
        const saltIndex = parseInt(searchParams.get('saltIndex') || '0', 10);

        if (!userEoaAddress) {
            return NextResponse.json(
                { error: 'userEoaAddress query parameter is required' },
                { status: 400 }
            );
        }

        if (!ethers.isAddress(userEoaAddress)) {
            return NextResponse.json(
                { error: 'Invalid Ethereum address' },
                { status: 400 }
            );
        }

        const normalizedAddress = ethers.getAddress(userEoaAddress);
        const saltNonce = deterministicSaltNonce(normalizedAddress, saltIndex);

        const rpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
        const provider = new ethers.JsonRpcProvider(rpcUrl);

        const safeAddress = await getSafeAddressIfDeployed(
            provider,
            normalizedAddress,
            saltNonce
        );

        return NextResponse.json({
            userEoaAddress: normalizedAddress,
            safeAddress: safeAddress,
            isDeployed: safeAddress !== null,
            chainId: SAFE_CONSTANTS.POLYGON_CHAIN_ID,
        });
    } catch (error) {
        console.error('Safe status check error:', error);
        return NextResponse.json(
            { error: 'Failed to check Safe status' },
            { status: 500 }
        );
    }
}
