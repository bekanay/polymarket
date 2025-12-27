/**
 * OrderForm Component
 * 
 * Order creation panel with Market/Limit order tabs and Buy/Sell toggle.
 * Now integrated with real order execution via useOrders hook.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrders, Side, type OrderResult } from '@/hooks/useOrders';

interface OrderFormProps {
    tokenId: string;
    currentPrice?: number;
    initialPrice?: number;
    initialSide?: 'buy' | 'sell';
    onOrderSuccess?: (result: OrderResult) => void;
    onOrderError?: (error: string) => void;
}

type OrderType = 'market' | 'limit';

export function OrderForm({
    tokenId,
    currentPrice = 0.5,
    initialPrice,
    initialSide,
    onOrderSuccess,
    onOrderError,
}: OrderFormProps) {
    const [orderType, setOrderType] = useState<OrderType>('market');
    const [side, setSide] = useState<'buy' | 'sell'>(initialSide || 'buy');
    const [amount, setAmount] = useState<string>('');
    const [limitPrice, setLimitPrice] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const { placeMarketOrder, placeLimitOrder, isSubmitting } = useOrders({
        onOrderSuccess: (result) => {
            setSuccessMessage(`Order placed! ${result.orderId ? `ID: ${result.orderId.slice(0, 8)}...` : ''}`);
            onOrderSuccess?.(result);
            // Clear form on success
            setAmount('');
            setLimitPrice('');
            // Clear success message after 5 seconds
            setTimeout(() => setSuccessMessage(null), 5000);
        },
        onOrderError: (err) => {
            setError(err);
            onOrderError?.(err);
        },
    });

    // Update price when clicked from order book
    useEffect(() => {
        if (initialPrice !== undefined) {
            setLimitPrice((initialPrice * 100).toFixed(1));
        }
    }, [initialPrice]);

    useEffect(() => {
        if (initialSide) {
            setSide(initialSide);
        }
    }, [initialSide]);

    const handleSubmit = useCallback(async () => {
        setError(null);
        setSuccessMessage(null);

        // Validation
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            setError('Please enter a valid amount');
            return;
        }

        if (amountNum < 1) {
            setError('Minimum order amount is $1');
            return;
        }

        const orderSide = side === 'buy' ? Side.BUY : Side.SELL;

        if (orderType === 'market') {
            // Market order - execute at current price
            await placeMarketOrder({
                tokenId,
                side: orderSide,
                amount: amountNum,
            });
        } else {
            // Limit order - execute at specified price
            const priceNum = parseFloat(limitPrice);
            if (isNaN(priceNum) || priceNum <= 0 || priceNum >= 100) {
                setError('Please enter a valid limit price (1-99%)');
                return;
            }

            const price = priceNum / 100; // Convert to 0-1 range
            const size = amountNum / price; // Calculate shares

            await placeLimitOrder({
                tokenId,
                side: orderSide,
                price,
                size,
            });
        }
    }, [amount, limitPrice, orderType, side, tokenId, placeMarketOrder, placeLimitOrder]);

    // Calculate estimated cost/proceeds
    const amountNum = parseFloat(amount) || 0;
    const priceForCalc = orderType === 'limit'
        ? (parseFloat(limitPrice) / 100) || currentPrice
        : currentPrice;
    const estimatedShares = priceForCalc > 0 ? amountNum / priceForCalc : 0;
    const potentialReturn = estimatedShares - amountNum;

    return (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4">
            <h3 className="text-sm font-semibold text-white mb-4">Place Order</h3>

            {/* Order Type Tabs */}
            <div className="flex gap-2 mb-4">
                <button
                    onClick={() => setOrderType('market')}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${orderType === 'market'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                        }`}
                >
                    Market
                </button>
                <button
                    onClick={() => setOrderType('limit')}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${orderType === 'limit'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                        }`}
                >
                    Limit
                </button>
            </div>

            {/* Buy/Sell Toggle */}
            <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                    onClick={() => setSide('buy')}
                    className={`py-3 text-sm font-semibold rounded-lg transition-colors ${side === 'buy'
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 border border-gray-600/50'
                        }`}
                >
                    Buy Yes
                </button>
                <button
                    onClick={() => setSide('sell')}
                    className={`py-3 text-sm font-semibold rounded-lg transition-colors ${side === 'sell'
                            ? 'bg-red-600 text-white'
                            : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 border border-gray-600/50'
                        }`}
                >
                    Buy No
                </button>
            </div>

            {/* Amount Input */}
            <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-1">Amount (USDC)</label>
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        min="1"
                        step="1"
                        className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg pl-7 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                </div>
                {/* Quick amount buttons */}
                <div className="flex gap-2 mt-2">
                    {[10, 25, 50, 100].map((val) => (
                        <button
                            key={val}
                            onClick={() => setAmount(val.toString())}
                            className="flex-1 py-1 text-xs bg-gray-700/50 text-gray-400 hover:bg-gray-700 rounded transition-colors"
                        >
                            ${val}
                        </button>
                    ))}
                </div>
            </div>

            {/* Limit Price (for limit orders) */}
            {orderType === 'limit' && (
                <div className="mb-4">
                    <label className="block text-xs text-gray-400 mb-1">Limit Price (%)</label>
                    <div className="relative">
                        <input
                            type="number"
                            value={limitPrice}
                            onChange={(e) => setLimitPrice(e.target.value)}
                            placeholder={(currentPrice * 100).toFixed(1)}
                            min="1"
                            max="99"
                            step="0.1"
                            className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                        Order fills when price reaches this level
                    </p>
                </div>
            )}

            {/* Order Preview */}
            {amountNum > 0 && (
                <div className="mb-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700/30">
                    <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">Est. Shares</span>
                        <span className="text-white">{estimatedShares.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">Price per Share</span>
                        <span className="text-white">{(priceForCalc * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between text-xs pt-1 border-t border-gray-700/30">
                        <span className="text-gray-400">Total Cost</span>
                        <span className="text-white font-medium">${amountNum.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                        <span className="text-gray-400">Potential Return</span>
                        <span className="text-green-400">${potentialReturn.toFixed(2)}</span>
                    </div>
                </div>
            )}

            {/* Success Message */}
            {successMessage && (
                <div className="mb-4 p-2 bg-green-900/20 border border-green-700/30 rounded-lg">
                    <p className="text-xs text-green-400 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {successMessage}
                    </p>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="mb-4 p-2 bg-red-900/20 border border-red-700/30 rounded-lg">
                    <p className="text-xs text-red-400">{error}</p>
                </div>
            )}

            {/* Submit Button */}
            <button
                onClick={handleSubmit}
                disabled={isSubmitting || !amount}
                className={`w-full py-3 text-sm font-semibold rounded-lg transition-colors ${side === 'buy'
                        ? 'bg-green-600 hover:bg-green-500 disabled:bg-green-600/50'
                        : 'bg-red-600 hover:bg-red-500 disabled:bg-red-600/50'
                    } text-white disabled:cursor-not-allowed`}
            >
                {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Processing...
                    </span>
                ) : (
                    `${side === 'buy' ? 'Buy Yes' : 'Buy No'} - $${amountNum.toFixed(2)}`
                )}
            </button>

            {/* Order Type Info */}
            <p className="text-xs text-gray-500 text-center mt-3">
                {orderType === 'market'
                    ? 'Executes immediately at best available price'
                    : 'Order stays active until filled or cancelled'
                }
            </p>
        </div>
    );
}

export default OrderForm;
