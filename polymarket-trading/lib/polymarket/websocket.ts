/**
 * WebSocket Service for Polymarket Real-Time Data
 * 
 * Connects to Polymarket's WebSocket API for live updates on:
 * - Order book changes
 * - Price updates
 * - Trade events
 * 
 * Supports multiple listeners via event emitter pattern.
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
}

// Callback types
export type OnBookUpdate = (tokenId: string, bids: Array<{ price: string; size: string }>, asks: Array<{ price: string; size: string }>) => void;
export type OnPriceUpdate = (tokenId: string, price: string) => void;
export type OnTradeUpdate = (tokenId: string, price: string) => void;
export type OnConnectionChange = (connected: boolean) => void;

interface Listener {
    id: string;
    tokenIds: string[];
    onBookUpdate?: OnBookUpdate;
    onPriceUpdate?: OnPriceUpdate;
    onTradeUpdate?: OnTradeUpdate;
    onConnectionChange?: OnConnectionChange;
}

/**
 * WebSocket Manager for Polymarket with multiple listener support
 */
export class PolymarketWebSocket {
    private ws: WebSocket | null = null;
    private subscriptions: Set<string> = new Set();
    private listeners: Map<string, Listener> = new Map();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;
    private pingInterval: NodeJS.Timeout | null = null;
    private isConnecting = false;
    private connected = false;

    /**
     * Add a listener for WebSocket events
     * Returns a unique listener ID for removal
     */
    addListener(listener: Omit<Listener, 'id'>): string {
        const id = Math.random().toString(36).substring(7);
        this.listeners.set(id, { ...listener, id });

        // Subscribe to new tokens
        listener.tokenIds.forEach(tokenId => {
            if (!this.subscriptions.has(tokenId)) {
                this.subscriptions.add(tokenId);
                if (this.connected) {
                    this.sendSubscription([tokenId]);
                }
            }
        });

        // Notify listener of current connection state
        if (listener.onConnectionChange) {
            listener.onConnectionChange(this.connected);
        }

        return id;
    }

    /**
     * Remove a listener by ID
     */
    removeListener(id: string) {
        this.listeners.delete(id);
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
                    this.connected = true;

                    // Notify all listeners
                    this.listeners.forEach(listener => {
                        listener.onConnectionChange?.(true);
                    });

                    // Start ping interval
                    this.startPing();

                    // Subscribe to all registered tokens
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
                    this.connected = false;
                    this.stopPing();

                    // Notify all listeners
                    this.listeners.forEach(listener => {
                        listener.onConnectionChange?.(false);
                    });

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
        this.listeners.clear();
        this.connected = false;
    }

    /**
     * Subscribe to updates for specific token IDs
     */
    subscribe(tokenIds: string[]) {
        const newTokens = tokenIds.filter(id => !this.subscriptions.has(id));
        newTokens.forEach(id => this.subscriptions.add(id));

        if (this.ws?.readyState === WebSocket.OPEN && newTokens.length > 0) {
            this.sendSubscription(newTokens);
        } else if (!this.connected && !this.isConnecting) {
            this.connect().catch(console.error);
        }
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
            // Skip PONG messages
            if (data === 'PONG') return;

            const messages: WSMessage[] = JSON.parse(data);
            const messageArray = Array.isArray(messages) ? messages : [messages];

            for (const msg of messageArray) {
                // Find listeners interested in this asset
                this.listeners.forEach(listener => {
                    if (!listener.tokenIds.includes(msg.asset_id)) return;

                    switch (msg.event_type) {
                        case 'book':
                            if (msg.bids && msg.asks) {
                                console.log('[WS] Book update for', msg.asset_id?.substring(0, 10), '- bids:', msg.bids.length, 'asks:', msg.asks.length);
                                listener.onBookUpdate?.(msg.asset_id, msg.bids, msg.asks);
                            }
                            break;

                        case 'price_change':
                            if (msg.price) {
                                console.log('[WS] Price change:', msg.price);
                                listener.onPriceUpdate?.(msg.asset_id, msg.price);
                            }
                            break;

                        case 'last_trade_price':
                            if (msg.price) {
                                console.log('[WS] Last trade:', msg.price);
                                listener.onTradeUpdate?.(msg.asset_id, msg.price);
                            }
                            break;
                    }
                });
            }
        } catch {
            // Non-JSON message (INVALID OPERATION, etc.)
            if (data !== 'PONG' && !data.includes('INVALID')) {
                console.log('[WS] Non-JSON message:', data);
            }
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
        }, 5000);
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
        return this.connected;
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
