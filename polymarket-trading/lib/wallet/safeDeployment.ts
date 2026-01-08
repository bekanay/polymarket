import { ethers } from 'ethers';
import { getPrivyClient } from '../privy/server';

// Official Gnosis Safe v1.3.0 addresses on Polygon
// Using canonical addresses from safe-global/safe-deployments
export const SAFE_CONSTANTS = {
    // Official Safe Proxy Factory 1.3.0 on Polygon (canonical deployment)
    PROXY_FACTORY: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
    // Official Safe L2 Singleton 1.3.0 on Polygon
    SINGLETON_L2: '0x3E5c63644E683549055b9Be8653de26E0B4CD36E',
    // Official Compatibility Fallback Handler 1.3.0
    FALLBACK_HANDLER: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
    POLYGON_CHAIN_ID: 137,
    POLYGON_CAIP2: 'eip155:137' as const,
} as const;

// Minimal ABI for Gnosis Safe Proxy Factory
const PROXY_FACTORY_ABI = [
    'function createProxyWithNonce(address _singleton, bytes memory initializer, uint256 saltNonce) public returns (address proxy)',
    'function proxyCreationCode() public pure returns (bytes memory)',
    'event ProxyCreation(address proxy, address singleton)',
];

// Minimal ABI for Gnosis Safe setup function
const SAFE_SETUP_ABI = [
    'function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver) external',
];

export interface DeploySafeParams {
    userEoaAddress: string;
    saltNonce?: bigint;
}

export interface DeploySafeResult {
    safeAddress: string;
    txHash: string;
}

/**
 * Encodes the Gnosis Safe setup function calldata
 * @param ownerAddress - The EOA address to set as the sole owner
 * @returns Encoded setup calldata
 */
export function encodeSetupCalldata(ownerAddress: string): string {
    const safeInterface = new ethers.Interface(SAFE_SETUP_ABI);

    const owners = [ownerAddress];
    const threshold = 1;
    const toAddress = ethers.ZeroAddress; // No additional setup module call
    const data = '0x'; // No additional data
    const fallbackHandler = SAFE_CONSTANTS.FALLBACK_HANDLER;
    const paymentToken = ethers.ZeroAddress; // No payment token (ETH)
    const payment = 0;
    const paymentReceiver = ethers.ZeroAddress;

    return safeInterface.encodeFunctionData('setup', [
        owners,
        threshold,
        toAddress,
        data,
        fallbackHandler,
        paymentToken,
        payment,
        paymentReceiver,
    ]);
}

/**
 * Encodes the createProxyWithNonce function calldata
 */
export function encodeCreateProxyWithNonce(
    initializer: string,
    saltNonce: bigint
): string {
    const factoryInterface = new ethers.Interface(PROXY_FACTORY_ABI);
    return factoryInterface.encodeFunctionData('createProxyWithNonce', [
        SAFE_CONSTANTS.SINGLETON_L2,
        initializer,
        saltNonce,
    ]);
}

/**
 * Computes the deterministic Safe address using CREATE2
 * @param initializer - The encoded setup calldata
 * @param saltNonce - The salt nonce for deterministic deployment
 * @param proxyCreationCode - The proxy creation code from the factory
 * @returns The computed Safe address
 */
export function computeSafeAddress(
    initializer: string,
    saltNonce: bigint,
    proxyCreationCode: string
): string {
    // Salt = keccak256(keccak256(initializer) + saltNonce)
    const initializerHash = ethers.keccak256(initializer);
    const salt = ethers.keccak256(
        ethers.solidityPacked(
            ['bytes32', 'uint256'],
            [initializerHash, saltNonce]
        )
    );

    // initCode = proxyCreationCode + singleton address (padded to 32 bytes)
    const singletonPadded = ethers.zeroPadValue(SAFE_CONSTANTS.SINGLETON_L2, 32);
    const initCode = ethers.concat([proxyCreationCode, singletonPadded]);
    const initCodeHash = ethers.keccak256(initCode);

    // CREATE2 address = keccak256(0xff + factory + salt + initCodeHash)[12:]
    const create2Input = ethers.concat([
        '0xff',
        SAFE_CONSTANTS.PROXY_FACTORY,
        salt,
        initCodeHash,
    ]);

    return ethers.getAddress('0x' + ethers.keccak256(create2Input).slice(-40));
}

/**
 * Generates a random salt nonce
 */
function generateSaltNonce(): bigint {
    const timestamp = BigInt(Date.now());
    const random = BigInt(Math.floor(Math.random() * 1000000));
    return timestamp * BigInt(1000000) + random;
}

/**
 * Creates a deterministic salt nonce from user address
 * Use this when you want the same user to always get the same Safe address
 */
export function deterministicSaltNonce(userAddress: string, index: number = 0): bigint {
    const hash = ethers.keccak256(
        ethers.solidityPacked(
            ['address', 'uint256'],
            [userAddress, index]
        )
    );
    return BigInt(hash);
}

/**
 * Deploys a Gnosis Safe using Privy wallet with gas sponsorship
 *
 * @param privyWalletId - The Privy wallet ID (user's embedded wallet)
 * @param params - Deployment parameters including the user's EOA address
 * @returns The deployed Safe address and transaction hash
 */
export async function deploySafeWithPrivy(
    privyWalletId: string,
    params: DeploySafeParams
): Promise<DeploySafeResult> {
    const { userEoaAddress, saltNonce = generateSaltNonce() } = params;

    // Validate the EOA address
    if (!ethers.isAddress(userEoaAddress)) {
        throw new Error(`Invalid EOA address: ${userEoaAddress}`);
    }

    const normalizedAddress = ethers.getAddress(userEoaAddress);

    // Get Privy client
    const privy = getPrivyClient();

    // Encode the setup initializer
    const initializer = encodeSetupCalldata(normalizedAddress);

    // Encode the factory call
    const deployCalldata = encodeCreateProxyWithNonce(initializer, saltNonce);

    // Get the proxy creation code to compute the expected address
    const rpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const factory = new ethers.Contract(
        SAFE_CONSTANTS.PROXY_FACTORY,
        PROXY_FACTORY_ABI,
        provider
    );
    const proxyCreationCode = await factory.proxyCreationCode();

    // Compute expected Safe address
    const expectedSafeAddress = computeSafeAddress(
        initializer,
        saltNonce,
        proxyCreationCode
    );

    // Check if Safe already exists
    const existingCode = await provider.getCode(expectedSafeAddress);
    if (existingCode !== '0x') {
        throw new Error(`Safe already deployed at ${expectedSafeAddress}`);
    }

    // Send transaction via Privy with gas sponsorship
    const result = await privy.walletApi.ethereum.sendTransaction({
        walletId: privyWalletId,
        caip2: SAFE_CONSTANTS.POLYGON_CAIP2,
        transaction: {
            to: SAFE_CONSTANTS.PROXY_FACTORY as `0x${string}`,
            data: deployCalldata as `0x${string}`,
            value: 0,
        },
        sponsor: true, // Gas is paid by Privy policy
    });

    console.log(`Safe deployed via Privy for ${normalizedAddress}:`, {
        expectedAddress: expectedSafeAddress,
        txHash: result.hash,
    });

    return {
        safeAddress: expectedSafeAddress,
        txHash: result.hash,
    };
}

/**
 * Checks if a Safe is already deployed for a given address and salt
 */
export async function getSafeAddressIfDeployed(
    provider: ethers.Provider,
    userEoaAddress: string,
    saltNonce: bigint
): Promise<string | null> {
    const factory = new ethers.Contract(
        SAFE_CONSTANTS.PROXY_FACTORY,
        PROXY_FACTORY_ABI,
        provider
    );

    const initializer = encodeSetupCalldata(userEoaAddress);
    const proxyCreationCode = await factory.proxyCreationCode();
    const expectedAddress = computeSafeAddress(initializer, saltNonce, proxyCreationCode);

    const code = await provider.getCode(expectedAddress);
    return code !== '0x' ? expectedAddress : null;
}
