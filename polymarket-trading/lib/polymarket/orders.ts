/**
 * Order Execution Service
 * 
 * Handles market orders, limit orders, and stop order monitoring.
 * Stop orders are implemented client-side since CLOB API doesn't support them natively.
 */

import {
    getPolymarketService,
    Side,
    OrderType,
    type OrderBookSummary
} from './clobClient';
import { ethers } from 'ethers';

// USDC contract on Polygon
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
// Polymarket CTF Exchange contract
const POLYMARKET_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

const ERC20_ABI = [
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
];

/**
 * Check USDC balance and allowance for a wallet
 */
async function checkUSDCStatus(walletAddress: string): Promise<{
    balance: bigint;
    allowance: bigint;
    balanceFormatted: string;
    allowanceFormatted: string;
}> {
    const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com');
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);

    const [balance, allowance] = await Promise.all([
        usdc.balanceOf(walletAddress),
        usdc.allowance(walletAddress, POLYMARKET_EXCHANGE),
    ]);

    return {
        balance,
        allowance,
        balanceFormatted: (Number(balance) / 1e6).toFixed(2),
        allowanceFormatted: Number(allowance) > 1e30 ? 'unlimited' : (Number(allowance) / 1e6).toFixed(2),
    };
}

// ============ Types ============

export interface MarketOrderParams {
    tokenId: string;
    side: Side;
    amount: number; // Amount in USDC to spend
}

export interface LimitOrderParams {
    tokenId: string;
    side: Side;
    price: number; // Price per share (0-1)
    size: number;  // Number of shares
}

export interface StopOrderParams {
    tokenId: string;
    side: Side;
    stopPrice: number; // Trigger price (0-1)
    amount: number;    // Amount in USDC to spend when triggered
}

export interface OrderResult {
    success: boolean;
    orderId?: string;
    executedPrice?: number;
    executedSize?: number;
    error?: string;
}

export interface PendingStopOrder {
    id: string;
    tokenId: string;
    side: Side;
    stopPrice: number;
    amount: number;
    createdAt: string;
    status: 'pending' | 'triggered' | 'cancelled' | 'failed';
    triggerCondition: 'above' | 'below';
}

// Storage key for stop orders
const STOP_ORDERS_STORAGE_KEY = 'polymarket_stop_orders';

// ============ Market Order ============

/**
 * Execute a market order immediately at best available price
 */
export async function createMarketOrder(
    params: MarketOrderParams
): Promise<OrderResult> {
    console.log('[Order] Creating market order:', params);
    const service = getPolymarketService();

    console.log('[Order] Service authenticated:', service.isAuthenticated());
    console.log('[Order] Service initialized:', service.isInitialized());

    if (!service.isAuthenticated()) {
        console.error('[Order] FAILED: Not authenticated');
        return {
            success: false,
            error: 'Not authenticated. Please connect wallet and initialize trading.'
        };
    }

    try {
        // Get funder address from service to check balance/allowance
        const funderAddress = service.getFunderAddress();
        if (funderAddress) {
            console.log('[Order] Checking USDC status for:', funderAddress);
            try {
                const usdcStatus = await checkUSDCStatus(funderAddress);
                console.log('[Order] USDC Balance:', usdcStatus.balanceFormatted, 'USDC');
                console.log('[Order] USDC Allowance for Exchange:', usdcStatus.allowanceFormatted);

                // Check if we have enough balance
                const requiredAmount = BigInt(Math.ceil(params.amount * 1e6));
                if (usdcStatus.balance < requiredAmount) {
                    return {
                        success: false,
                        error: `Insufficient USDC balance. Have: $${usdcStatus.balanceFormatted}, Need: $${params.amount.toFixed(2)}`
                    };
                }

                // Check if allowance is sufficient
                if (usdcStatus.allowance < requiredAmount) {
                    return {
                        success: false,
                        error: `USDC not approved for trading. Please click "Approve USDC for Buying" first. Current allowance: $${usdcStatus.allowanceFormatted}`
                    };
                }
            } catch (err) {
                console.warn('[Order] Could not check USDC status:', err);
                // Continue anyway - let the API handle the error
            }
        }

        // Get current best price from order book
        const orderBook = await service.getOrderBook(params.tokenId);

        if (!orderBook) {
            return { success: false, error: 'Failed to fetch order book' };
        }

        // For BUY: use lowest ask price
        // For SELL: use highest bid price
        const bestPrice = params.side === Side.BUY
            ? getBestAsk(orderBook)
            : getBestBid(orderBook);

        if (!bestPrice) {
            return {
                success: false,
                error: `No ${params.side === Side.BUY ? 'asks' : 'bids'} available`
            };
        }

        // Calculate size based on amount and price
        const size = params.amount / bestPrice;

        console.log(`Executing market order: ${params.side} ${size.toFixed(4)} shares @ ${bestPrice} (${params.amount} USDC)`);

        // Execute via CLOB client
        const result = await service.createMarketOrder(
            params.tokenId,
            params.side,
            params.amount
        );

        if (result.success) {
            return {
                success: true,
                orderId: result.orderId,
                executedPrice: bestPrice,
                executedSize: size,
            };
        } else {
            return {
                success: false,
                error: result.error || 'Order execution failed',
            };
        }
    } catch (error) {
        console.error('Market order error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// ============ Limit Order ============

/**
 * Place a limit order at a specific price
 */
export async function createLimitOrder(
    params: LimitOrderParams
): Promise<OrderResult> {
    console.log('[Order] Creating limit order:', params);
    const service = getPolymarketService();

    console.log('[Order] Service authenticated:', service.isAuthenticated());
    console.log('[Order] Service initialized:', service.isInitialized());

    if (!service.isAuthenticated()) {
        console.error('[Order] FAILED: Not authenticated');
        return {
            success: false,
            error: 'Not authenticated. Please connect wallet and initialize trading.'
        };
    }

    // Validate price
    if (params.price <= 0 || params.price >= 1) {
        return {
            success: false,
            error: 'Price must be between 0 and 1'
        };
    }

    // Validate size
    if (params.size <= 0) {
        return {
            success: false,
            error: 'Size must be greater than 0'
        };
    }

    try {
        console.log(`Placing limit order: ${params.side} ${params.size} shares @ ${params.price}`);

        const result = await service.createOrder({
            tokenId: params.tokenId,
            side: params.side,
            price: params.price,
            size: params.size,
            orderType: OrderType.GTC, // Good-Til-Cancelled
        });

        if (result.success) {
            return {
                success: true,
                orderId: result.orderId,
                executedPrice: params.price,
                executedSize: params.size,
            };
        } else {
            return {
                success: false,
                error: result.error || 'Order placement failed',
            };
        }
    } catch (error) {
        console.error('Limit order error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// ============ Stop Order (Client-Side) ============

/**
 * Create a stop order (stored locally, monitored client-side)
 * 
 * NOTE: Polymarket CLOB API does NOT support stop orders natively.
 * This implementation stores the order locally and monitors prices.
 * When stop price is reached, a market order is executed.
 */
export function createStopOrder(params: StopOrderParams): PendingStopOrder {
    const service = getPolymarketService();

    // Determine trigger condition based on side and current price logic
    // For stop-loss (sell when price drops): trigger when price falls BELOW stopPrice
    // For stop-buy (buy when price rises): trigger when price rises ABOVE stopPrice
    const triggerCondition: 'above' | 'below' = params.side === Side.BUY ? 'above' : 'below';

    const stopOrder: PendingStopOrder = {
        id: generateOrderId(),
        tokenId: params.tokenId,
        side: params.side,
        stopPrice: params.stopPrice,
        amount: params.amount,
        createdAt: new Date().toISOString(),
        status: 'pending',
        triggerCondition,
    };

    // Store in localStorage
    const existingOrders = getStoredStopOrders();
    existingOrders.push(stopOrder);
    saveStopOrders(existingOrders);

    console.log(`Stop order created: ${stopOrder.id} - ${params.side} ${params.amount} USDC when price ${triggerCondition} ${params.stopPrice}`);

    return stopOrder;
}

/**
 * Cancel a pending stop order
 */
export function cancelStopOrder(orderId: string): boolean {
    const orders = getStoredStopOrders();
    const orderIndex = orders.findIndex(o => o.id === orderId);

    if (orderIndex === -1) {
        return false;
    }

    orders[orderIndex].status = 'cancelled';
    saveStopOrders(orders);
    return true;
}

/**
 * Get all pending stop orders
 */
export function getPendingStopOrders(): PendingStopOrder[] {
    return getStoredStopOrders().filter(o => o.status === 'pending');
}

/**
 * Get all stop orders (including cancelled/triggered)
 */
export function getAllStopOrders(): PendingStopOrder[] {
    return getStoredStopOrders();
}

/**
 * Check and execute triggered stop orders
 * Call this periodically (e.g., every 5 seconds) when monitoring is active
 */
export async function checkStopOrders(): Promise<{
    triggered: PendingStopOrder[];
    results: OrderResult[];
}> {
    const service = getPolymarketService();
    const pendingOrders = getPendingStopOrders();
    const triggered: PendingStopOrder[] = [];
    const results: OrderResult[] = [];

    for (const order of pendingOrders) {
        try {
            // Get current price
            const orderBook = await service.getOrderBook(order.tokenId);
            if (!orderBook) continue;

            const currentPrice = order.side === Side.BUY
                ? getBestAsk(orderBook)
                : getBestBid(orderBook);

            if (!currentPrice) continue;

            // Check trigger condition
            const shouldTrigger = order.triggerCondition === 'above'
                ? currentPrice >= order.stopPrice
                : currentPrice <= order.stopPrice;

            if (shouldTrigger) {
                console.log(`Stop order ${order.id} triggered at price ${currentPrice}`);
                triggered.push(order);

                // Execute market order
                const result = await createMarketOrder({
                    tokenId: order.tokenId,
                    side: order.side,
                    amount: order.amount,
                });

                results.push(result);

                // Update order status
                updateStopOrderStatus(order.id, result.success ? 'triggered' : 'failed');
            }
        } catch (error) {
            console.error(`Error checking stop order ${order.id}:`, error);
        }
    }

    return { triggered, results };
}

// ============ Helper Functions ============

function getBestBid(orderBook: OrderBookSummary): number | null {
    if (!orderBook.bids || orderBook.bids.length === 0) return null;

    // Find highest bid
    const highestBid = orderBook.bids.reduce((max, bid) => {
        const price = parseFloat(bid.price);
        return price > max ? price : max;
    }, 0);

    return highestBid > 0 ? highestBid : null;
}

function getBestAsk(orderBook: OrderBookSummary): number | null {
    if (!orderBook.asks || orderBook.asks.length === 0) return null;

    // Find lowest ask
    const lowestAsk = orderBook.asks.reduce((min, ask) => {
        const price = parseFloat(ask.price);
        return min === 0 || price < min ? price : min;
    }, 0);

    return lowestAsk > 0 ? lowestAsk : null;
}

function generateOrderId(): string {
    return `stop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getStoredStopOrders(): PendingStopOrder[] {
    if (typeof window === 'undefined') return [];

    try {
        const stored = localStorage.getItem(STOP_ORDERS_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function saveStopOrders(orders: PendingStopOrder[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STOP_ORDERS_STORAGE_KEY, JSON.stringify(orders));
}

function updateStopOrderStatus(orderId: string, status: PendingStopOrder['status']): void {
    const orders = getStoredStopOrders();
    const orderIndex = orders.findIndex(o => o.id === orderId);

    if (orderIndex !== -1) {
        orders[orderIndex].status = status;
        saveStopOrders(orders);
    }
}

// Re-export Side for convenience
export { Side };
