/**
 * Script to find existing proxy wallet address
 * Run with: node --experimental-specifier-resolution=node lib/wallet/findProxyWallet.mjs
 */

import { ethers, keccak256, toUtf8Bytes, AbiCoder, getCreate2Address } from 'ethers';

const PROXY_FACTORY = '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2';
const SAFE_MASTER_COPY_L2 = '0x3E5c63644E683549055b9Be8653de26E0B4CD36E';
const FALLBACK_HANDLER = '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4';

// Your owner address
const OWNER_ADDRESS = '0xFB77aeBbAe1Ae2e6FCb34eB77CA8f5BE76A3f17B';

// Polygon RPC
const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com');

// Safe ABI for setup
const SAFE_ABI = [
    'function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver) external',
];

// Proxy Factory ABI
const PROXY_FACTORY_ABI = [
    'function proxyCreationCode() public pure returns (bytes memory)',
];

function generateSaltNonce(ownerAddress) {
    const hash = keccak256(toUtf8Bytes(`polymarket-proxy-${ownerAddress.toLowerCase()}`));
    const shortHash = hash.slice(0, 18);
    return BigInt(shortHash).toString();
}

function generateSetupData(ownerAddress) {
    const safeInterface = new ethers.Interface(SAFE_ABI);
    return safeInterface.encodeFunctionData('setup', [
        [ownerAddress],
        1,
        ethers.ZeroAddress,
        '0x',
        FALLBACK_HANDLER,
        ethers.ZeroAddress,
        0,
        ethers.ZeroAddress,
    ]);
}

async function findProxyWallet() {
    console.log('Owner Address:', OWNER_ADDRESS);

    const saltNonce = generateSaltNonce(OWNER_ADDRESS);
    console.log('Salt Nonce:', saltNonce);

    const initializer = generateSetupData(OWNER_ADDRESS);
    console.log('Initializer (first 100 chars):', initializer.slice(0, 100) + '...');

    // Get proxy creation code
    const factoryContract = new ethers.Contract(PROXY_FACTORY, PROXY_FACTORY_ABI, provider);
    const proxyCreationCode = await factoryContract.proxyCreationCode();

    // Calculate salt
    const salt = keccak256(
        AbiCoder.defaultAbiCoder().encode(
            ['bytes32', 'uint256'],
            [keccak256(initializer), saltNonce]
        )
    );

    // Calculate deployment data
    const deploymentData = ethers.concat([
        proxyCreationCode,
        AbiCoder.defaultAbiCoder().encode(['address'], [SAFE_MASTER_COPY_L2])
    ]);

    // Calculate CREATE2 address
    const predictedAddress = getCreate2Address(
        PROXY_FACTORY,
        salt,
        keccak256(deploymentData)
    );

    console.log('\n=== PREDICTED PROXY WALLET ADDRESS ===');
    console.log(predictedAddress);

    // Check if code exists at this address
    const code = await provider.getCode(predictedAddress);
    console.log('\nCode exists:', code !== '0x' ? 'YES ✅' : 'NO ❌');

    if (code !== '0x') {
        const balance = await provider.getBalance(predictedAddress);
        console.log('Balance:', ethers.formatEther(balance), 'MATIC');
    }

    return predictedAddress;
}

findProxyWallet().catch(console.error);
