/**
 * Polymarket CLOB Client Service
 * 
 * Provides a wrapper around the @polymarket/clob-client for:
 * - Fetching market data
 * - Fetching order books
 * - Creating and managing orders
 * - Getting user positions and orders
 */

import {
    ClobClient,
    Side,
    OrderType,
    type ApiKeyCreds,
    type OrderBookSummary,
    type MarketPrice,
    type OpenOrder,
    type Trade,
    type UserOrder,
    type CreateOrderOptions,
} from '@polymarket/clob-client';
import type { Wallet } from '@ethersproject/wallet';
import type { JsonRpcSigner } from '@ethersproject/providers';
import { SignatureType } from '@polymarket/order-utils';

// Polymarket CLOB API host
const CLOB_HOST = 'https://clob.polymarket.com';
const CHAIN_ID = 137; // Polygon Mainnet

// Re-export types for consumers
export { Side, OrderType };
export type { OrderBookSummary, MarketPrice, OpenOrder, Trade };

/**
 * Market information from Polymarket
 */
export interface Market {
    condition_id: string;
    question_id: string;
    tokens: {
        token_id: string;
        outcome: string;
        price?: number;
    }[];
    question: string;
    description?: string;
    end_date_iso?: string;
    active: boolean;
    closed: boolean;
    accepting_orders: boolean;
    minimum_order_size?: number;
    minimum_tick_size?: number;
}

/**
 * Simplified market for list display
 */
export interface SimplifiedMarket {
    condition_id: string;
    question: string;
    tokens: {
        token_id: string;
        outcome: string;
        price?: number;
    }[];
    active: boolean;
    closed: boolean;
    end_date_iso?: string;
    // Volume and liquidity metrics
    volume24hr?: number;
    liquidity?: number;
    // Price change (calculated from previous day)
    priceChange24hr?: number;
}

/**
 * Order parameters for creating a new order
 */
export interface OrderParams {
    tokenId: string;
    side: Side;
    price: number;
    size: number;
    orderType?: OrderType;
}

/**
 * User position in a market
 */
export interface Position {
    market: string;
    outcome: string;
    size: number;
    avgPrice: number;
    currentPrice: number;
    unrealizedPnl: number;
}

/**
 * Parse Gamma API token data into our SimplifiedMarket token format
 */
function parseGammaTokens(
    outcomePrices?: string | number[],
    outcomes?: string | string[],
    clobTokenIds?: string | string[]
): { token_id: string; outcome: string; price?: number }[] {
    try {
        // Handle both JSON string and array formats
        let prices: (string | number)[] = [];
        if (typeof outcomePrices === 'string') {
            prices = JSON.parse(outcomePrices);
        } else if (Array.isArray(outcomePrices)) {
            prices = outcomePrices;
        }

        let outcomeNames: string[] = ['Yes', 'No'];
        if (typeof outcomes === 'string') {
            outcomeNames = JSON.parse(outcomes);
        } else if (Array.isArray(outcomes)) {
            outcomeNames = outcomes;
        }

        let tokenIds: string[] = [];
        if (typeof clobTokenIds === 'string') {
            tokenIds = JSON.parse(clobTokenIds);
        } else if (Array.isArray(clobTokenIds)) {
            tokenIds = clobTokenIds;
        }

        return outcomeNames.map((outcome: string, index: number) => {
            const rawPrice = prices[index];
            let price: number | undefined;

            if (rawPrice !== undefined && rawPrice !== null) {
                price = typeof rawPrice === 'number' ? rawPrice : parseFloat(rawPrice);
                // Ensure valid number
                if (isNaN(price)) price = undefined;
            }

            return {
                token_id: tokenIds[index] || '',
                outcome: outcome,
                price: price,
            };
        });
    } catch (err) {
        console.error('Error parsing Gamma tokens:', err, { outcomePrices, outcomes, clobTokenIds });
        // Fallback for simple Yes/No markets
        return [
            { token_id: '', outcome: 'Yes', price: undefined },
            { token_id: '', outcome: 'No', price: undefined },
        ];
    }
}

// Storage key for API credentials
const CLOB_CREDS_STORAGE_KEY = 'polymarket_clob_credentials';
const PROXY_WALLETS_STORAGE_KEY = 'polymarket_proxy_wallets';

/**
 * Save CLOB credentials to localStorage
 */
function saveCredentials(address: string, creds: ApiKeyCreds): void {
    if (typeof window === 'undefined') return;

    try {
        const stored = localStorage.getItem(CLOB_CREDS_STORAGE_KEY);
        const allCreds = stored ? JSON.parse(stored) : {};
        allCreds[address.toLowerCase()] = {
            ...creds,
            savedAt: Date.now(),
        };
        localStorage.setItem(CLOB_CREDS_STORAGE_KEY, JSON.stringify(allCreds));
    } catch (e) {
        console.warn('Failed to save CLOB credentials:', e);
    }
}

/**
 * Clear all stored credentials and reset service state
 * Call this on logout/disconnect for security
 */
export function clearAllCredentials(): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.removeItem(CLOB_CREDS_STORAGE_KEY);
        localStorage.removeItem(PROXY_WALLETS_STORAGE_KEY);
        console.log('All CLOB credentials cleared');

        // Reset the singleton service
        resetPolymarketService();
    } catch (e) {
        console.warn('Failed to clear credentials:', e);
    }
}

/**
 * Load CLOB credentials from localStorage
 * Returns null if not found or expired (30 days)
 */
function loadCredentials(address: string): ApiKeyCreds | null {
    if (typeof window === 'undefined') return null;

    try {
        const stored = localStorage.getItem(CLOB_CREDS_STORAGE_KEY);
        if (!stored) return null;

        const allCreds = JSON.parse(stored);
        const creds = allCreds[address.toLowerCase()];

        if (!creds) return null;

        // Check if credentials are expired (30 days)
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        if (creds.savedAt && Date.now() - creds.savedAt > thirtyDaysMs) {
            // Expired, remove them
            delete allCreds[address.toLowerCase()];
            localStorage.setItem(CLOB_CREDS_STORAGE_KEY, JSON.stringify(allCreds));
            return null;
        }

        // Return credentials without savedAt
        const { savedAt, ...apiCreds } = creds;
        return apiCreds as ApiKeyCreds;
    } catch (e) {
        console.warn('Failed to load CLOB credentials:', e);
        return null;
    }
}

/**
 * PolymarketService - Main service for interacting with Polymarket CLOB
 */
export class PolymarketService {
    private client: ClobClient | null = null;
    private creds: ApiKeyCreds | null = null;
    private signer: Wallet | JsonRpcSigner | null = null;
    private funderAddress: string | null = null;
    private initialized: boolean = false;
    private signerAddress: string | null = null;

    /**
     * Initialize the service with read-only access (no signer)
     * Use for fetching market data without authentication
     */
    initializeReadOnly(): void {
        this.client = new ClobClient(CLOB_HOST, CHAIN_ID);
        this.initialized = true;
    }

    /**
     * Initialize the service with a signer for authenticated operations
     * @param signer - Wallet or JsonRpcSigner
     * @param funderAddress - The proxy wallet address that will fund orders
     */
    async initialize(
        signer: Wallet | JsonRpcSigner,
        funderAddress: string
    ): Promise<void> {
        // Get signer address
        const signerAddr = await signer.getAddress();

        // Skip if already authenticated with same signer and funder
        if (this.isAuthenticated() &&
            this.signerAddress === signerAddr &&
            this.funderAddress === funderAddress) {
            console.log('Trading service already initialized, skipping...');
            return;
        }

        this.signer = signer;
        this.funderAddress = funderAddress;
        this.signerAddress = signerAddr;

        // Try to load cached credentials first
        let cachedCreds = loadCredentials(signerAddr);

        if (cachedCreds) {
            console.log('Using cached CLOB credentials');
            this.creds = cachedCreds;
        } else {
            console.log('Creating new CLOB API credentials (signature required)...');
            // Create or derive API credentials (requires signature)
            const tempClient = new ClobClient(CLOB_HOST, CHAIN_ID, signer);

            // Retry logic - first attempt sometimes fails on new wallets
            let retries = 3;
            let lastError: Error | null = null;

            while (retries > 0) {
                try {
                    this.creds = await tempClient.createOrDeriveApiKey();
                    break; // Success, exit loop
                } catch (err) {
                    lastError = err instanceof Error ? err : new Error(String(err));
                    console.warn(`API key creation failed (${retries} retries left):`, lastError.message);
                    retries--;
                    if (retries > 0) {
                        // Wait before retry (longer delay for API to settle)
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            }

            if (!this.creds) {
                throw lastError || new Error('Failed to create API credentials after retries');
            }

            // Save credentials for future use
            saveCredentials(signerAddr, this.creds);
            console.log('CLOB credentials saved to cache');
        }

        // Determine signature type based on whether we're using a proxy wallet
        // SignatureType.EOA (0) = signer is the maker (no proxy)
        // SignatureType.POLY_PROXY (1) = signer is different from maker (using proxy wallet)
        const isUsingProxy = funderAddress.toLowerCase() !== signerAddr.toLowerCase();
        const signatureType = isUsingProxy ? SignatureType.POLY_PROXY : SignatureType.EOA;

        console.log(`Initializing CLOB client: signer=${signerAddr}, funder=${funderAddress}, isProxy=${isUsingProxy}, signatureType=${signatureType}`);

        // Create authenticated client
        this.client = new ClobClient(
            CLOB_HOST,
            CHAIN_ID,
            signer,
            this.creds,
            signatureType,
            funderAddress
        );

        this.initialized = true;
    }

    /**
     * Check if service is initialized
     */
    isInitialized(): boolean {
        return this.initialized && this.client !== null;
    }

    /**
     * Check if service has authenticated credentials
     */
    isAuthenticated(): boolean {
        return this.isInitialized() && this.creds !== null;
    }

    /**
     * Get the funder address (the wallet that funds orders)
     */
    getFunderAddress(): string | null {
        return this.funderAddress;
    }

    // ============ Market Data Methods ============

    /**
     * Get all available markets from Gamma API (has full market data including questions)
     * @param limit - Number of markets to fetch
     * @param offset - Pagination offset
     */
    async getMarkets(limit: number = 100, offset: number = 0): Promise<{
        markets: SimplifiedMarket[];
        next_cursor?: string;
    }> {
        try {
            // Use local API route to proxy Gamma Markets API (avoids CORS)
            const response = await fetch(
                `/api/markets?limit=${limit}&offset=${offset}&active=true&closed=false`,
                {
                    headers: {
                        'Accept': 'application/json',
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`Gamma API error: ${response.status}`);
            }

            const data = await response.json();

            // Debug logging removed - uncomment if needed for debugging
            // if (data && data.length > 0) {
            //     console.log('Gamma API first market sample:', JSON.stringify(data[0], null, 2).substring(0, 1000));
            // }

            // Transform Gamma API response to our SimplifiedMarket format
            const markets: SimplifiedMarket[] = (data || []).map((market: {
                conditionId?: string;
                condition_id?: string;
                question?: string;
                outcomePrices?: string;
                outcomes?: string;
                active?: boolean;
                closed?: boolean;
                endDate?: string;
                clobTokenIds?: string;
                // Volume and liquidity fields from Gamma API
                volume24hr?: number;
                volume?: number;
                liquidity?: number;
                // Price change data
                oneDayPriceChange?: number;
            }) => {
                // Parse volume - Gamma API may use different field names
                const vol24hr = market.volume24hr ?? market.volume ?? 0;

                // Parse prices and calculate change
                const tokens = parseGammaTokens(market.outcomePrices, market.outcomes, market.clobTokenIds);
                const yesToken = tokens.find(t => t.outcome === 'Yes');
                const currentPrice = yesToken?.price ?? 0.5;

                // Price change from Gamma API or default to 0
                const priceChange = market.oneDayPriceChange ?? 0;

                return {
                    condition_id: market.conditionId || market.condition_id || '',
                    question: market.question || 'Unknown Market',
                    tokens,
                    active: market.active !== false,
                    closed: market.closed === true,
                    end_date_iso: market.endDate,
                    volume24hr: vol24hr,
                    liquidity: market.liquidity ?? 0,
                    priceChange24hr: priceChange,
                };
            });

            return {
                markets,
                next_cursor: markets.length >= limit ? String(offset + limit) : undefined,
            };
        } catch (error) {
            console.error('Error fetching markets from Gamma API:', error);
            return { markets: [] };
        }
    }

    /**
     * Get detailed market information by condition ID
     * Uses direct CLOB API call to avoid CORS issues with Gamma API
     * @param conditionId - The market's condition ID
     */
    async getMarket(conditionId: string): Promise<Market | null> {

        try {
            // Direct fetch to CLOB API (avoids CORS issues with Gamma API)
            const response = await fetch(`https://clob.polymarket.com/markets/${conditionId}`, {
                headers: {
                    'Accept': 'application/json',
                },
            });

            if (!response.ok) {
                return null;
            }

            const data = await response.json();

            // Transform CLOB API response to our Market format
            return {
                condition_id: data.condition_id || conditionId,
                question_id: data.question_id || '',
                tokens: data.tokens || [],
                question: data.question || data.description || 'Unknown Market',
                description: data.description,
                end_date_iso: data.end_date_iso,
                active: data.active !== false,
                closed: data.closed === true,
                accepting_orders: data.accepting_orders !== false,
                minimum_order_size: data.minimum_order_size,
                minimum_tick_size: data.minimum_tick_size,
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Get order book for a specific token
     * @param tokenId - The token ID (outcome) to get order book for
     */
    async getOrderBook(tokenId: string): Promise<OrderBookSummary | null> {
        if (!this.client) {
            this.initializeReadOnly();
        }

        try {
            return await this.client!.getOrderBook(tokenId);
        } catch (error) {
            console.error('Error fetching order book:', error);
            return null;
        }
    }

    /**
     * Get midpoint price for a token
     * @param tokenId - The token ID
     */
    async getMidpoint(tokenId: string): Promise<number | null> {
        if (!this.client) {
            this.initializeReadOnly();
        }

        try {
            const midpoint = await this.client!.getMidpoint(tokenId);
            return parseFloat(midpoint.mid);
        } catch (error) {
            console.error('Error fetching midpoint:', error);
            return null;
        }
    }

    /**
     * Get last trade price for a token
     * @param tokenId - The token ID
     */
    async getLastPrice(tokenId: string): Promise<number | null> {
        if (!this.client) {
            this.initializeReadOnly();
        }

        try {
            const lastPrice = await this.client!.getLastTradePrice(tokenId);
            return parseFloat(lastPrice.price);
        } catch (error) {
            console.error('Error fetching last price:', error);
            return null;
        }
    }

    /**
     * Get price history for a token
     * @param tokenId - The token ID
     * @param startTs - Start timestamp (optional)
     * @param endTs - End timestamp (optional)
     * @param fidelity - Data fidelity (optional)
     */
    async getPriceHistory(
        tokenId: string,
        startTs?: number,
        endTs?: number,
        fidelity?: number
    ): Promise<MarketPrice[]> {
        if (!this.client) {
            this.initializeReadOnly();
        }

        try {
            return await this.client!.getPricesHistory({
                market: tokenId,
                startTs,
                endTs,
                fidelity,
            });
        } catch (error) {
            console.error('Error fetching price history:', error);
            return [];
        }
    }

    /**
     * Get current spread for a token
     * @param tokenId - The token ID
     */
    async getSpread(tokenId: string): Promise<{ bid: number; ask: number } | null> {
        if (!this.client) {
            this.initializeReadOnly();
        }

        try {
            const spread = await this.client!.getSpread(tokenId);
            return {
                bid: parseFloat(spread.bid),
                ask: parseFloat(spread.ask),
            };
        } catch (error) {
            console.error('Error fetching spread:', error);
            return null;
        }
    }

    // ============ Order Methods ============

    /**
     * Create and post a limit order
     * @param params - Order parameters
     */
    async createOrder(params: OrderParams): Promise<{
        success: boolean;
        orderId?: string;
        error?: string;
    }> {
        if (!this.isAuthenticated()) {
            return { success: false, error: 'Not authenticated. Call initialize() first.' };
        }

        try {
            const userOrder: UserOrder = {
                tokenID: params.tokenId,
                price: params.price,
                side: params.side,
                size: params.size,
            };

            const options: Partial<CreateOrderOptions> = {};

            const orderType = (params.orderType || OrderType.GTC) as OrderType.GTC | OrderType.GTD;

            const response = await this.client!.createAndPostOrder(
                userOrder,
                options,
                orderType
            );

            return {
                success: true,
                orderId: response.orderID || response.order_id,
            };
        } catch (error: unknown) {
            console.error('Error creating order:', error);
            // Extract error message from axios response if available
            let errorMessage = 'Unknown error';
            if (error && typeof error === 'object') {
                const axiosError = error as { response?: { data?: { error?: string } }; message?: string };
                if (axiosError.response?.data?.error) {
                    errorMessage = axiosError.response.data.error;
                } else if (axiosError.message) {
                    errorMessage = axiosError.message;
                }
            }
            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    /**
     * Create and post a market order
     * @param tokenId - The token ID
     * @param side - Buy or Sell
     * @param amount - Amount in USDC to spend
     */
    async createMarketOrder(
        tokenId: string,
        side: Side,
        amount: number
    ): Promise<{
        success: boolean;
        orderId?: string;
        error?: string;
    }> {
        if (!this.isAuthenticated()) {
            return { success: false, error: 'Not authenticated. Call initialize() first.' };
        }

        try {
            console.log('[CLOB] Calling createAndPostMarketOrder...');
            const response = await this.client!.createAndPostMarketOrder(
                {
                    tokenID: tokenId,
                    amount: amount,
                    side: side,
                },
                {},
                OrderType.FOK // Fill or Kill for market orders
            );

            console.log('[CLOB] createAndPostMarketOrder response:', response);

            // Check if response indicates an error
            if (response && typeof response === 'object' && 'error' in response) {
                console.log('[CLOB] Response contains error:', response.error);
                return {
                    success: false,
                    error: String(response.error) || 'Order failed',
                };
            }

            return {
                success: true,
                orderId: response?.orderID || response?.order_id,
            };
        } catch (error: unknown) {
            console.error('[CLOB] createMarketOrder caught error:', error);
            // Extract error message from axios response if available
            let errorMessage = 'Unknown error';
            if (error && typeof error === 'object') {
                const axiosError = error as { response?: { data?: { error?: string } }; message?: string };
                if (axiosError.response?.data?.error) {
                    errorMessage = axiosError.response.data.error;
                } else if (axiosError.message) {
                    errorMessage = axiosError.message;
                }
            }
            console.log('[CLOB] Extracted error message:', errorMessage);
            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    /**
     * Cancel an order by ID
     * @param orderId - The order ID to cancel
     */
    async cancelOrder(orderId: string): Promise<boolean> {
        if (!this.isAuthenticated()) {
            return false;
        }

        try {
            await this.client!.cancelOrder({ orderID: orderId });
            return true;
        } catch (error) {
            console.error('Error canceling order:', error);
            return false;
        }
    }

    /**
     * Cancel all open orders
     */
    async cancelAllOrders(): Promise<boolean> {
        if (!this.isAuthenticated()) {
            return false;
        }

        try {
            await this.client!.cancelAll();
            return true;
        } catch (error) {
            console.error('Error canceling all orders:', error);
            return false;
        }
    }

    // ============ User Data Methods ============

    /**
     * Get user's open orders
     */
    async getUserOrders(): Promise<OpenOrder[]> {
        if (!this.isAuthenticated()) {
            return [];
        }

        try {
            const response = await this.client!.getOpenOrders();
            return response || [];
        } catch (error) {
            console.error('Error fetching user orders:', error);
            return [];
        }
    }

    /**
     * Get a specific order by ID
     * @param orderId - The order ID
     */
    async getOrder(orderId: string): Promise<OpenOrder | null> {
        if (!this.isAuthenticated()) {
            return null;
        }

        try {
            return await this.client!.getOrder(orderId);
        } catch (error) {
            console.error('Error fetching order:', error);
            return null;
        }
    }

    /**
     * Get user's trade history
     */
    async getUserTrades(): Promise<Trade[]> {
        if (!this.isAuthenticated()) {
            return [];
        }

        try {
            return await this.client!.getTrades();
        } catch (error) {
            console.error('Error fetching user trades:', error);
            return [];
        }
    }

    /**
     * Get balance and allowance for trading
     */
    async getBalanceAllowance(): Promise<{
        balance: string;
        allowance: string;
    } | null> {
        if (!this.isAuthenticated()) {
            return null;
        }

        try {
            const response = await this.client!.getBalanceAllowance();
            return {
                balance: response.balance,
                allowance: response.allowance,
            };
        } catch (error) {
            console.error('Error fetching balance allowance:', error);
            return null;
        }
    }
}

// ============ Singleton Instance ============

let polymarketServiceInstance: PolymarketService | null = null;

/**
 * Get or create a singleton instance of PolymarketService
 */
export function getPolymarketService(): PolymarketService {
    if (!polymarketServiceInstance) {
        polymarketServiceInstance = new PolymarketService();
    }
    return polymarketServiceInstance;
}

/**
 * Reset the singleton instance
 */
export function resetPolymarketService(): void {
    polymarketServiceInstance = null;
}
