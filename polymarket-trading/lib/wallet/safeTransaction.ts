import { ethers, type TypedDataField } from 'ethers';

export const SAFE_TX_TYPES: Record<string, TypedDataField[]> = {
    SafeTx: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
        { name: 'operation', type: 'uint8' },
        { name: 'safeTxGas', type: 'uint256' },
        { name: 'baseGas', type: 'uint256' },
        { name: 'gasPrice', type: 'uint256' },
        { name: 'gasToken', type: 'address' },
        { name: 'refundReceiver', type: 'address' },
        { name: 'nonce', type: 'uint256' },
    ],
};

export const SAFE_TX_EIP712_TYPES: Record<string, TypedDataField[]> = {
    EIP712Domain: [
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
    ],
    ...SAFE_TX_TYPES,
};

export const SAFE_EXEC_ABI = [
    'function nonce() view returns (uint256)',
    'function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) returns (bool success)',
];

export interface SafeTransaction {
    to: string;
    value: bigint;
    data: string;
    operation: number;
    safeTxGas: bigint;
    baseGas: bigint;
    gasPrice: bigint;
    gasToken: string;
    refundReceiver: string;
    nonce: bigint;
}

export function buildSafeTransaction(params: {
    to: string;
    data: string;
    nonce: bigint;
    value?: bigint;
    operation?: number;
    safeTxGas?: bigint;
    baseGas?: bigint;
    gasPrice?: bigint;
    gasToken?: string;
    refundReceiver?: string;
}): SafeTransaction {
    return {
        to: params.to,
        data: params.data,
        nonce: params.nonce,
        value: params.value ?? BigInt(0),
        operation: params.operation ?? 0,
        safeTxGas: params.safeTxGas ?? BigInt(0),
        baseGas: params.baseGas ?? BigInt(0),
        gasPrice: params.gasPrice ?? BigInt(0),
        gasToken: params.gasToken ?? ethers.ZeroAddress,
        refundReceiver: params.refundReceiver ?? ethers.ZeroAddress,
    };
}

export function getSafeTxHash(
    chainId: number,
    safeAddress: string,
    safeTx: SafeTransaction
): string {
    const domain = {
        chainId,
        verifyingContract: safeAddress,
    };
    return ethers.TypedDataEncoder.hash(domain, SAFE_TX_TYPES, safeTx);
}

export function buildSafeTypedData(
    chainId: number,
    safeAddress: string,
    safeTx: SafeTransaction
): {
    types: Record<string, TypedDataField[]>;
    primaryType: string;
    domain: { chainId: number; verifyingContract: string };
    message: Record<string, unknown>;
} {
    const message = {
        to: safeTx.to,
        value: safeTx.value.toString(),
        data: safeTx.data,
        operation: safeTx.operation,
        safeTxGas: safeTx.safeTxGas.toString(),
        baseGas: safeTx.baseGas.toString(),
        gasPrice: safeTx.gasPrice.toString(),
        gasToken: safeTx.gasToken,
        refundReceiver: safeTx.refundReceiver,
        nonce: safeTx.nonce.toString(),
    };

    return {
        types: SAFE_TX_EIP712_TYPES,
        primaryType: 'SafeTx',
        domain: {
            chainId,
            verifyingContract: safeAddress,
        },
        message: message as Record<string, unknown>,
    };
}

export async function signTypedDataV4(
    provider: { request: (args: { method: string; params?: unknown[] }) => Promise<string> },
    ownerAddress: string,
    typedData: {
        types: Record<string, TypedDataField[]>;
        primaryType: string;
        domain: { chainId: number; verifyingContract: string };
        message: Record<string, unknown>;
    }
): Promise<string> {
    return await provider.request({
        method: 'eth_signTypedData_v4',
        params: [ownerAddress, JSON.stringify(typedData)],
    });
}

export async function signSafeTransaction(
    signer: ethers.Signer,
    chainId: number,
    safeAddress: string,
    safeTx: SafeTransaction
): Promise<string> {
    const domain = {
        chainId,
        verifyingContract: safeAddress,
    };

    if (typeof (signer as any).signTypedData === 'function') {
        return await (signer as any).signTypedData(domain, SAFE_TX_TYPES, safeTx);
    }

    const safeTxHash = getSafeTxHash(chainId, safeAddress, safeTx);
    const rawSignature = await signer.signMessage(ethers.getBytes(safeTxHash));
    const signature = ethers.Signature.from(rawSignature);
    return ethers.Signature.from({
        r: signature.r,
        s: signature.s,
        v: signature.v + 4,
    }).serialized;
}

export function encodeSafeExecTransaction(
    safeTx: SafeTransaction,
    signatures: string
): string {
    const iface = new ethers.Interface(SAFE_EXEC_ABI);
    return iface.encodeFunctionData('execTransaction', [
        safeTx.to,
        safeTx.value,
        safeTx.data,
        safeTx.operation,
        safeTx.safeTxGas,
        safeTx.baseGas,
        safeTx.gasPrice,
        safeTx.gasToken,
        safeTx.refundReceiver,
        signatures,
    ]);
}
