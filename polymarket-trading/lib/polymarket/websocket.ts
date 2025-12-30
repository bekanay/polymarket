/**
 * WebSocket Service for Polymarket Real-Time Data
 * 
 * Connects to Polymarket's WebSocket API for live updates on:
 * - Order book changes
 * - Price updates
 * - Trade events
 */

// WebSocket URL for Polymarket CLOB
const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

// Event types from Polymarket
export type WSEventType = 'book' | 'price_change' | 'last_trade_price' | 'tick_size_change';

// WebSocket message structure
export interface WSMessage {
    event_type: WSEventType;
    asset_id: string;  // token ID
    market?: string;
    timestamp?: string;
    // For book events
    bids?: Array<{ price: string; size: string }>;
    asks?: Array<{ price: string; size: string }>;
    hash?: string;
    // For price_change events
    price?: string;
    changes?: Array<{ price: string; size: string }>;
    // For last_trade_price
    // price field is reused
}

export interface WSSubscription {
    assets_ids: string[];
    type: WSEventType;
}

// Callback types
export type OnBookUpdate = (tokenId: string, bids: Array<{ price: string; size: string }>, asks: Array<{ price: string; size: string }>) => void;
export type OnPriceUpdate = (tokenId: string, price: string) => void;
export type OnTradeUpdate = (tokenId: string, price: string) => void;
export type OnConnectionChange = (connected: boolean) => void;

/**
 * WebSocket Manager for Polymarket
 */
export class PolymarketWebSocket {
    private ws: WebSocket | null = null;
    private subscriptions: Set<string> = new Set();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;
    private pingInterval: NodeJS.Timeout | null = null;
    private isConnecting = false;

    // Callbacks
    private onBookUpdate: OnBookUpdate | null = null;
    private onPriceUpdate: OnPriceUpdate | null = null;
    private onTradeUpdate: OnTradeUpdate | null = null;
    private onConnectionChange: OnConnectionChange | null = null;

    /**
     * Set callback handlers
     */
    setCallbacks(callbacks: {
        onBookUpdate?: OnBookUpdate;
        onPriceUpdate?: OnPriceUpdate;
        onTradeUpdate?: OnTradeUpdate;
        onConnectionChange?: OnConnectionChange;
    }) {
        if (callbacks.onBookUpdate) this.onBookUpdate = callbacks.onBookUpdate;
        if (callbacks.onPriceUpdate) this.onPriceUpdate = callbacks.onPriceUpdate;
        if (callbacks.onTradeUpdate) this.onTradeUpdate = callbacks.onTradeUpdate;
        if (callbacks.onConnectionChange) this.onConnectionChange = callbacks.onConnectionChange;
    }

    /**
     * Connect to WebSocket server
     */
    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }

            if (this.isConnecting) {
                resolve();
                return;
            }

            this.isConnecting = true;

            try {
                console.log('[WS] Connecting to Polymarket WebSocket...');
                this.ws = new WebSocket(WS_URL);

                this.ws.onopen = () => {
                    console.log('[WS] Connected to Polymarket WebSocket');
                    this.isConnecting = false;
                    this.reconnectAttempts = 0;
                    this.onConnectionChange?.(true);

                    // Start ping interval to keep connection alive
                    this.startPing();

                    // Re-subscribe to previously subscribed assets
                    if (this.subscriptions.size > 0) {
                        this.sendSubscription(Array.from(this.subscriptions));
                    }

                    resolve();
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.ws.onclose = () => {
                    console.log('[WS] WebSocket closed');
                    this.isConnecting = false;
                    this.stopPing();
                    this.onConnectionChange?.(false);
                    this.attemptReconnect();
                };

                this.ws.onerror = (error) => {
                    console.error('[WS] WebSocket error:', error);
                    this.isConnecting = false;
                    reject(error);
                };
            } catch (error) {
                this.isConnecting = false;
                reject(error);
            }
        });
    }

    /**
     * Disconnect from WebSocket
     */
    disconnect() {
        this.stopPing();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.subscriptions.clear();
    }

    /**
     * Subscribe to updates for specific token IDs
     */
    subscribe(tokenIds: string[]) {
        tokenIds.forEach(id => this.subscriptions.add(id));

        if (this.ws?.readyState === WebSocket.OPEN) {
            this.sendSubscription(tokenIds);
        } else {
            // Connect first, then subscribe
            this.connect().catch(console.error);
        }
    }

    /**
     * Unsubscribe from token IDs
     */
    unsubscribe(tokenIds: string[]) {
        tokenIds.forEach(id => this.subscriptions.delete(id));
        // Note: Polymarket WS doesn't have explicit unsubscribe, 
        // just stop processing those events
    }

    /**
     * Send subscription message to WebSocket
     */
    private sendSubscription(tokenIds: string[]) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const message = {
            assets_ids: tokenIds,
            type: 'market'
        };

        console.log('[WS] Subscribing to:', tokenIds);
        this.ws.send(JSON.stringify(message));
    }

    /**
     * Handle incoming WebSocket messages
     */
    private handleMessage(data: string) {
        try {
            const messages: WSMessage[] = JSON.parse(data);

            // Can be array or single message
            const messageArray = Array.isArray(messages) ? messages : [messages];

            for (const msg of messageArray) {
                switch (msg.event_type) {
                    case 'book':
                        if (msg.asset_id && msg.bids && msg.asks) {
                            this.onBookUpdate?.(msg.asset_id, msg.bids, msg.asks);
                        }
                        break;

                    case 'price_change':
                        if (msg.asset_id && msg.price) {
                            this.onPriceUpdate?.(msg.asset_id, msg.price);
                        }
                        break;

                    case 'last_trade_price':
                        if (msg.asset_id && msg.price) {
                            this.onTradeUpdate?.(msg.asset_id, msg.price);
                        }
                        break;
                }
            }
        } catch (error) {
            // Might be a ping/pong or other non-JSON message
            console.debug('[WS] Non-JSON message:', data);
        }
    }

    /**
     * Start ping interval to keep connection alive
     */
    private startPing() {
        this.stopPing();
        this.pingInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send('PING');
            }
        }, 5000); // Ping every 5 seconds as recommended
    }

    /**
     * Stop ping interval
     */
    private stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    /**
     * Attempt to reconnect after disconnection
     */
    private attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[WS] Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            this.connect().catch(console.error);
        }, delay);
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }
}

// Singleton instance
let wsInstance: PolymarketWebSocket | null = null;

/**
 * Get or create WebSocket instance
 */
export function getPolymarketWebSocket(): PolymarketWebSocket {
    if (!wsInstance) {
        wsInstance = new PolymarketWebSocket();
    }
    return wsInstance;
}

/**
 * Reset WebSocket instance (for cleanup)
 */
export function resetPolymarketWebSocket(): void {
    if (wsInstance) {
        wsInstance.disconnect();
        wsInstance = null;
    }
}
