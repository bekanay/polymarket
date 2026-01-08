/**
 * Wallet utilities exports
 * Provides Safe transaction and deployment utilities for wallet management
 */

export {
    SAFE_TX_TYPES,
    SAFE_TX_EIP712_TYPES,
    SAFE_EXEC_ABI,
    type SafeTransaction,
    buildSafeTransaction,
    getSafeTxHash,
    buildSafeTypedData,
    signTypedDataV4,
    signSafeTransaction,
    encodeSafeExecTransaction,
} from './safeTransaction';

export {
    SAFE_CONSTANTS,
    type DeploySafeParams,
    type DeploySafeResult,
    encodeSetupCalldata,
    encodeCreateProxyWithNonce,
    computeSafeAddress,
    deploySafeWithPrivy,
    deterministicSaltNonce,
    getSafeAddressIfDeployed,
} from './safeDeployment';
