/**
 * Proxy Wallet Service - Gnosis Safe Integration
 * 
 * This service handles the creation and management of proxy wallets using
 * Gnosis Safe for each user. Proxy wallets enable gas-sponsored transactions
 * and provide a secure way to manage user funds.
 * 
 * Key Features:
 * - 1 proxy wallet per user (singleton pattern)
 * - Storage mapping: userWallet -> proxyWallet
 * - Safe Factory pattern for wallet creation
 * - Compatible with ethers v6
 * 
 * Note: This implementation uses the Gnosis Safe Proxy Factory contract directly
 * to maintain compatibility with ethers v6. The @safe-global/safe-core-sdk package
 * is designed for ethers v5, so we implement the core functionality natively.
 */

import { ethers, Contract, Provider, Signer, Interface, TransactionReceipt, keccak256, toUtf8Bytes, AbiCoder, getCreate2Address } from 'ethers';

// Storage key for proxy wallet mappings
const PROXY_WALLET_STORAGE_KEY = 'polymarket_proxy_wallets';

// Polygon mainnet contract addresses (Gnosis Safe v1.3.0)
// Safe contracts are deployed at the same addresses across most EVM chains
const SAFE_CONTRACTS: Record<number, {
    proxyFactory: string;
    safeMasterCopy: string;
    safeMasterCopyL2: string;
    fallbackHandler: string;
}> = {
    // Polygon Mainnet
    137: {
        proxyFactory: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
        safeMasterCopy: '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552', // L1 Safe
        safeMasterCopyL2: '0x3E5c63644E683549055b9Be8653de26E0B4CD36E', // L2 Safe (recommended for Polygon)
        fallbackHandler: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
    },
    // Polygon Amoy Testnet (Safe contracts deployed at same addresses)
    80002: {
        proxyFactory: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
        safeMasterCopy: '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552',
        safeMasterCopyL2: '0x3E5c63644E683549055b9Be8653de26E0B4CD36E',
        fallbackHandler: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
    },
};

// Safe Proxy Factory ABI (minimal for deployment)
const PROXY_FACTORY_ABI = [
    'function createProxyWithNonce(address _singleton, bytes memory initializer, uint256 saltNonce) public returns (address proxy)',
    'function proxyCreationCode() public pure returns (bytes memory)',
    'event ProxyCreation(address proxy, address singleton)',
];

// Safe Master Copy ABI (minimal for initialization)
const SAFE_ABI = [
    'function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver) external',
    'function getOwners() public view returns (address[] memory)',
    'function getThreshold() public view returns (uint256)',
    'function nonce() public view returns (uint256)',
    'function VERSION() public view returns (string memory)',
];

// Interface for wallet mapping storage
interface WalletMapping {
    userAddress: string;
    proxyWalletAddress: string;
    createdAt: string;
    chainId: number;
}

// Interface for proxy wallet creation result
export interface ProxyWalletResult {
    proxyWalletAddress: string;
    isNew: boolean;
    transactionHash?: string;
}

// Interface for Safe information
export interface SafeInfo {
    address: string;
    owners: string[];
    threshold: number;
    nonce: number;
    balance: string;
    chainId: number;
    version?: string;
}

/**
 * ProxyWalletService handles Gnosis Safe proxy wallet creation and management
 */
export class ProxyWalletService {
    private provider: Provider;
    private signer: Signer | null = null;
    private chainId: number;
    private contracts: typeof SAFE_CONTRACTS[137];

    /**
     * Initialize the ProxyWalletService
     * @param providerUrl - RPC URL for the blockchain network
     * @param chainId - Chain ID (default: 137 for Polygon Mainnet)
     */
    constructor(providerUrl?: string, chainId: number = 137) {
        this.chainId = chainId;

        // Select RPC URL based on chain
        const rpcUrls: Record<number, string> = {
            137: process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com',
            80002: 'https://rpc-amoy.polygon.technology',
        };
        const rpcUrl = providerUrl || rpcUrls[this.chainId] || rpcUrls[137];

        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.contracts = SAFE_CONTRACTS[this.chainId] || SAFE_CONTRACTS[137];
    }

    /**
     * Connect a signer (wallet) to the service
     * @param signer - ethers Signer instance
     */
    async connectSigner(signer: Signer): Promise<void> {
        this.signer = signer;
    }

    /**
     * Connect using a private key (for server-side or testing)
     * @param privateKey - Private key string
     */
    async connectWithPrivateKey(privateKey: string): Promise<void> {
        const wallet = new ethers.Wallet(privateKey, this.provider);
        await this.connectSigner(wallet);
    }

    /**
     * Generate Safe setup data (initializer bytes)
     */
    private generateSafeSetupData(ownerAddress: string): string {
        const safeInterface = new Interface(SAFE_ABI);

        return safeInterface.encodeFunctionData('setup', [
            [ownerAddress],          // owners array
            1,                        // threshold
            ethers.ZeroAddress,       // to (optional delegate call)
            '0x',                     // data (optional delegate call data)
            this.contracts.fallbackHandler, // fallback handler
            ethers.ZeroAddress,       // payment token (0 = ETH)
            0,                        // payment amount
            ethers.ZeroAddress,       // payment receiver
        ]);
    }

    /**
     * Generate a deterministic salt nonce from owner address
     * Returns a numeric string to avoid BigInt conversion issues
     */
    private generateSaltNonce(ownerAddress: string): string {
        // Create a deterministic salt based on owner address
        const hash = keccak256(toUtf8Bytes(`polymarket-proxy-${ownerAddress.toLowerCase()}`));
        // Take only the first 16 hex chars (64 bits) to avoid overflow issues
        const shortHash = hash.slice(0, 18); // "0x" + 16 hex chars
        return BigInt(shortHash).toString();
    }

    /**
     * Predict the Safe proxy address before deployment
     * Uses CREATE2 address calculation
     */
    async predictProxyAddress(ownerAddress: string): Promise<string> {
        const saltNonce = this.generateSaltNonce(ownerAddress);
        const initializer = this.generateSafeSetupData(ownerAddress);

        // Get proxy creation code from factory
        const factoryContract = new Contract(
            this.contracts.proxyFactory,
            PROXY_FACTORY_ABI,
            this.provider
        );

        const proxyCreationCode = await factoryContract.proxyCreationCode();

        // Calculate the initializer hash for salt
        const salt = keccak256(
            AbiCoder.defaultAbiCoder().encode(
                ['bytes32', 'uint256'],
                [keccak256(initializer), saltNonce]
            )
        );

        // Calculate proxy bytecode hash (creation code + singleton address)
        const deploymentData = ethers.concat([
            proxyCreationCode,
            AbiCoder.defaultAbiCoder().encode(['address'], [this.contracts.safeMasterCopyL2])
        ]);

        // Calculate CREATE2 address
        const predictedAddress = getCreate2Address(
            this.contracts.proxyFactory,
            salt,
            keccak256(deploymentData)
        );

        return predictedAddress;
    }

    /**
     * Create a new proxy wallet (Gnosis Safe) for the owner address
     * @param ownerAddress - The address that will own this proxy wallet
     * @param onTransactionHash - Optional callback when transaction is sent
     * @returns ProxyWalletResult containing the proxy wallet address
     */
    async createProxyWallet(
        ownerAddress: string,
        onTransactionHash?: (txHash: string) => void
    ): Promise<ProxyWalletResult> {
        // Check if user already has a proxy wallet
        const existingWallet = this.getProxyWallet(ownerAddress);
        if (existingWallet) {
            return {
                proxyWalletAddress: existingWallet,
                isNew: false,
            };
        }

        if (!this.signer) {
            throw new Error('No signer connected. Call connectSigner() first.');
        }

        // Create Safe Proxy Factory contract instance
        const proxyFactory = new Contract(
            this.contracts.proxyFactory,
            PROXY_FACTORY_ABI,
            this.signer
        );

        // Generate the Safe setup data (initializer)
        const initializer = this.generateSafeSetupData(ownerAddress);

        // Generate deterministic salt nonce
        const saltNonce = this.generateSaltNonce(ownerAddress);

        let txHash: string;
        let proxyWalletAddress: string | null = null;

        try {
            // Deploy the Safe proxy
            const tx = await proxyFactory.createProxyWithNonce(
                this.contracts.safeMasterCopyL2, // Use L2 Safe for Polygon
                initializer,
                saltNonce
            );

            txHash = tx.hash;

            if (txHash && onTransactionHash) {
                onTransactionHash(txHash);
            }

            // Try to wait for transaction using tx.wait()
            // This may fail with Privy due to malformed response
            try {
                const receipt = await tx.wait();

                // Find ProxyCreation event
                const proxyFactoryInterface = new Interface(PROXY_FACTORY_ABI);
                for (const log of receipt.logs) {
                    try {
                        const parsed = proxyFactoryInterface.parseLog({
                            topics: log.topics as string[],
                            data: log.data,
                        });
                        if (parsed && parsed.name === 'ProxyCreation') {
                            proxyWalletAddress = parsed.args[0];
                            break;
                        }
                    } catch {
                        // Not a ProxyCreation event, continue
                    }
                }
            } catch (waitError) {
                // tx.wait() failed, likely due to Privy provider issues
                // Fall back to polling for receipt
                console.warn('tx.wait() failed, polling for receipt:', waitError);
                proxyWalletAddress = await this.pollForProxyAddress(txHash);
            }
        } catch (error) {
            // If the error contains a transaction hash, the tx was sent but response parsing failed
            const errorStr = String(error);
            const hashMatch = errorStr.match(/"hash":\s*"(0x[a-fA-F0-9]{64})"/);

            if (hashMatch) {
                txHash = hashMatch[1];
                console.warn('Transaction sent but response parsing failed, polling for receipt');

                if (onTransactionHash) {
                    onTransactionHash(txHash);
                }

                proxyWalletAddress = await this.pollForProxyAddress(txHash);
            } else {
                throw error;
            }
        }

        if (!proxyWalletAddress) {
            throw new Error('Failed to get proxy wallet address from deployment transaction');
        }

        // Store the mapping
        this.storeProxyWallet(ownerAddress, proxyWalletAddress);

        return {
            proxyWalletAddress,
            isNew: true,
            transactionHash: txHash!,
        };
    }

    /**
     * Poll for transaction receipt and extract proxy address
     * Used as fallback when tx.wait() fails due to provider issues
     */
    private async pollForProxyAddress(txHash: string, maxAttempts: number = 30): Promise<string | null> {
        const proxyFactoryInterface = new Interface(PROXY_FACTORY_ABI);

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Wait 2 seconds between attempts
            await new Promise(resolve => setTimeout(resolve, 2000));

            try {
                const receipt = await this.provider.getTransactionReceipt(txHash);

                if (receipt && receipt.status === 1) {
                    // Transaction confirmed, find ProxyCreation event
                    for (const log of receipt.logs) {
                        try {
                            const parsed = proxyFactoryInterface.parseLog({
                                topics: log.topics as string[],
                                data: log.data,
                            });
                            if (parsed && parsed.name === 'ProxyCreation') {
                                return parsed.args[0];
                            }
                        } catch {
                            // Not a ProxyCreation event, continue
                        }
                    }
                } else if (receipt && receipt.status === 0) {
                    throw new Error('Transaction failed');
                }
                // If receipt is null, transaction is still pending
            } catch (error) {
                // Ignore errors during polling, keep trying
                console.warn(`Polling attempt ${attempt + 1} failed:`, error);
            }
        }

        return null;
    }

    /**
     * Get existing proxy wallet address for a user
     * @param userAddress - The user's main wallet address
     * @returns Proxy wallet address or null if not found
     */
    getProxyWallet(userAddress: string): string | null {
        const mappings = this.getStoredMappings();
        const normalizedAddress = userAddress.toLowerCase();

        const mapping = mappings.find(
            m => m.userAddress.toLowerCase() === normalizedAddress && m.chainId === this.chainId
        );

        return mapping?.proxyWalletAddress || null;
    }

    /**
     * Check if a proxy wallet exists on-chain for this user (even if not in localStorage)
     * and recover it if found
     * @param userAddress - The user's main wallet address
     * @returns Proxy wallet address if found on-chain, null otherwise
     */
    async checkAndRecoverWallet(userAddress: string): Promise<string | null> {
        // First check localStorage
        const stored = this.getProxyWallet(userAddress);
        if (stored) {
            return stored;
        }

        // Predict the address and check if deployed
        try {
            const predictedAddress = await this.predictProxyAddress(userAddress);
            const isDeployed = await this.isSafeDeployed(predictedAddress);

            if (isDeployed) {
                // Wallet exists on-chain but not in localStorage - recover it
                this.storeProxyWallet(userAddress, predictedAddress);
                console.log('Recovered existing proxy wallet:', predictedAddress);
                return predictedAddress;
            }
        } catch (error) {
            console.error('Error checking for existing wallet:', error);
        }

        return null;
    }

    /**
     * Manually add a proxy wallet address for a user (for recovery purposes)
     * @param userAddress - The user's main wallet address
     * @param proxyWalletAddress - The proxy wallet address to store
     */
    recoverWallet(userAddress: string, proxyWalletAddress: string): void {
        this.storeProxyWallet(userAddress, proxyWalletAddress);
    }

    /**
     * Check if user has a proxy wallet
     * @param userAddress - The user's main wallet address
     * @returns boolean indicating if proxy wallet exists
     */
    hasProxyWallet(userAddress: string): boolean {
        return this.getProxyWallet(userAddress) !== null;
    }

    /**
     * Get or create a proxy wallet for the user
     * @param userAddress - The user's main wallet address
     * @param onTransactionHash - Optional callback when transaction is sent
     * @returns ProxyWalletResult
     */
    async getOrCreateProxyWallet(
        userAddress: string,
        onTransactionHash?: (txHash: string) => void
    ): Promise<ProxyWalletResult> {
        const existing = this.getProxyWallet(userAddress);
        if (existing) {
            return {
                proxyWalletAddress: existing,
                isNew: false,
            };
        }

        return this.createProxyWallet(userAddress, onTransactionHash);
    }

    /**
     * Get Safe information (balance, owners, threshold, etc.)
     * @param safeAddress - The Safe address
     * @returns Safe information object
     */
    async getSafeInfo(safeAddress: string): Promise<SafeInfo> {
        const safeContract = new Contract(safeAddress, SAFE_ABI, this.provider);

        const [owners, threshold, nonce, balance, version] = await Promise.all([
            safeContract.getOwners(),
            safeContract.getThreshold(),
            safeContract.nonce(),
            this.provider.getBalance(safeAddress),
            safeContract.VERSION().catch(() => 'unknown'),
        ]);

        return {
            address: safeAddress,
            owners: owners as string[],
            threshold: Number(threshold),
            nonce: Number(nonce),
            balance: balance.toString(),
            chainId: this.chainId,
            version,
        };
    }

    /**
     * Get the native (MATIC) balance of a proxy wallet
     * @param proxyWalletAddress - The proxy wallet address
     * @returns Balance in wei as string
     */
    async getProxyWalletBalance(proxyWalletAddress: string): Promise<string> {
        const balance = await this.provider.getBalance(proxyWalletAddress);
        return balance.toString();
    }

    /**
     * Get the USDC balance of a proxy wallet (for Polymarket trading)
     * @param proxyWalletAddress - The proxy wallet address
     * @returns USDC balance as string (in USDC units with 6 decimals)
     */
    async getUSDCBalance(proxyWalletAddress: string): Promise<string> {
        // Native USDC on Polygon (Polymarket uses this, NOT USDC.e)
        const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
        const USDC_ABI = ['function balanceOf(address) view returns (uint256)'];

        const usdcContract = new Contract(USDC_ADDRESS, USDC_ABI, this.provider);
        const balance = await usdcContract.balanceOf(proxyWalletAddress);

        // Return raw balance (divide by 10^6 for human-readable format)
        return balance.toString();
    }

    /**
     * Check if a Safe is deployed at the given address
     * @param address - Address to check
     * @returns Boolean indicating if Safe is deployed
     */
    async isSafeDeployed(address: string): Promise<boolean> {
        const code = await this.provider.getCode(address);
        return code !== '0x';
    }

    /**
     * Remove a stored proxy wallet mapping
     * @param userAddress - The user's main wallet address
     */
    removeProxyWallet(userAddress: string): void {
        const mappings = this.getStoredMappings();
        const normalizedAddress = userAddress.toLowerCase();

        const filteredMappings = mappings.filter(
            m => !(m.userAddress.toLowerCase() === normalizedAddress && m.chainId === this.chainId)
        );

        this.saveMappings(filteredMappings);
    }

    /**
     * Get all stored proxy wallet mappings
     * @returns Array of wallet mappings
     */
    getAllMappings(): WalletMapping[] {
        return this.getStoredMappings().filter(m => m.chainId === this.chainId);
    }

    // ============ Private Helper Methods ============

    /**
     * Store proxy wallet mapping in localStorage
     */
    private storeProxyWallet(userAddress: string, proxyWalletAddress: string): void {
        const mappings = this.getStoredMappings();

        // Remove existing mapping for this user if any
        const filteredMappings = mappings.filter(
            m => !(m.userAddress.toLowerCase() === userAddress.toLowerCase() && m.chainId === this.chainId)
        );

        // Add new mapping
        filteredMappings.push({
            userAddress: userAddress.toLowerCase(),
            proxyWalletAddress: proxyWalletAddress.toLowerCase(),
            createdAt: new Date().toISOString(),
            chainId: this.chainId,
        });

        this.saveMappings(filteredMappings);
    }

    /**
     * Get stored mappings from localStorage
     */
    private getStoredMappings(): WalletMapping[] {
        if (typeof window === 'undefined') {
            // Server-side: return empty array
            return [];
        }

        try {
            const stored = localStorage.getItem(PROXY_WALLET_STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    }

    /**
     * Save mappings to localStorage
     */
    private saveMappings(mappings: WalletMapping[]): void {
        if (typeof window === 'undefined') {
            // Server-side: skip
            return;
        }

        localStorage.setItem(PROXY_WALLET_STORAGE_KEY, JSON.stringify(mappings));
    }
}

// ============ Singleton Instance ============

let proxyWalletServiceInstance: ProxyWalletService | null = null;

/**
 * Get or create a singleton instance of ProxyWalletService
 * @param providerUrl - Optional RPC URL
 * @param chainId - Optional chain ID (defaults based on NODE_ENV)
 * @returns ProxyWalletService instance
 */
export function getProxyWalletService(
    providerUrl?: string,
    chainId?: number
): ProxyWalletService {
    if (!proxyWalletServiceInstance) {
        proxyWalletServiceInstance = new ProxyWalletService(providerUrl, chainId);
    }
    return proxyWalletServiceInstance;
}

/**
 * Reset the singleton instance (useful for testing or chain switching)
 */
export function resetProxyWalletService(): void {
    proxyWalletServiceInstance = null;
}

// Export default instance getter for convenience
export default getProxyWalletService;
