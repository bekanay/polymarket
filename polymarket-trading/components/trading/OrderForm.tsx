/**
 * OrderForm Component
 * 
 * Order creation panel with Market/Limit order tabs and Buy/Sell toggle.
 * Now integrated with real order execution via useOrders hook.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrders, Side, type OrderResult } from '@/hooks/useOrders';
import { useApproveUSDC } from '@/hooks/useApproveUSDC';
import { useApproveCTF } from '@/hooks/useApproveCTF';

interface OrderFormProps {
    tokenId: string;         // YES token ID
    noTokenId?: string;      // NO token ID (for Buy No orders)
    currentPrice?: number;
    initialPrice?: number;
    initialSide?: 'buy' | 'sell';
    onOrderSuccess?: (result: OrderResult) => void;
    onOrderError?: (error: string) => void;
}

type OrderType = 'market' | 'limit';
type TradeAction = 'buyYes' | 'buyNo' | 'sellYes' | 'sellNo';

export function OrderForm({
    tokenId,
    noTokenId,
    currentPrice = 0.5,
    initialPrice,
    initialSide,
    onOrderSuccess,
    onOrderError,
}: OrderFormProps) {
    const [orderType, setOrderType] = useState<OrderType>('market');
    const [action, setAction] = useState<TradeAction>(initialSide === 'sell' ? 'sellYes' : 'buyYes');
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
            console.log('[OrderForm] Error received:', err);
            setError(err);
            onOrderError?.(err);
            // Check if it's an allowance error
            if (err.toLowerCase().includes('allowance') || err.toLowerCase().includes('balance')) {
                setNeedsApproval(true);
            }
        },
    });

    const { approveUSDC, isApproving: isApprovingUSDC, error: approvalError } = useApproveUSDC();
    const { approveCTF, isApproving: isApprovingCTF, error: ctfApprovalError } = useApproveCTF();
    const [needsApproval, setNeedsApproval] = useState(false);

    // Determine if this is a buy or sell action (also used in calculations)
    const isBuyAction = action === 'buyYes' || action === 'buyNo';

    // Update price when clicked from order book
    useEffect(() => {
        if (initialPrice !== undefined) {
            setLimitPrice((initialPrice * 100).toFixed(1));
        }
    }, [initialPrice]);

    useEffect(() => {
        if (initialSide === 'sell') {
            setAction('sellYes');
        } else if (initialSide === 'buy') {
            setAction('buyYes');
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

        // Determine token and side based on action
        // Buy Yes = BUY on YES token
        // Buy No = BUY on NO token
        // Sell Yes = SELL on YES token
        // Sell No = SELL on NO token
        const isBuy = action === 'buyYes' || action === 'buyNo';
        const isYesToken = action === 'buyYes' || action === 'sellYes';
        const targetTokenId = isYesToken ? tokenId : (noTokenId || tokenId);
        const orderSide = isBuy ? Side.BUY : Side.SELL;

        if (orderType === 'market') {
            // Market order - execute at current price
            // For BUY: amount is USDC to spend
            // For SELL: amount is number of shares to sell
            await placeMarketOrder({
                tokenId: targetTokenId,
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
            // For BUY: calculate shares from USDC amount
            // For SELL: amount is already the number of shares
            const size = isBuy ? (amountNum / price) : amountNum;

            await placeLimitOrder({
                tokenId: targetTokenId,
                side: orderSide,
                price,
                size,
            });
        }
    }, [amount, limitPrice, orderType, action, tokenId, noTokenId, placeMarketOrder, placeLimitOrder]);

    // Calculate estimated cost/proceeds
    const amountNum = parseFloat(amount) || 0;
    const priceForCalc = orderType === 'limit'
        ? (parseFloat(limitPrice) / 100) || currentPrice
        : currentPrice;

    // For BUY: amount is USDC spent, calculate shares received
    // For SELL: amount is shares to sell, calculate USDC received
    const estimatedShares = isBuyAction
        ? (priceForCalc > 0 ? amountNum / priceForCalc : 0)
        : amountNum; // For sell, amount IS the shares
    const estimatedProceeds = isBuyAction
        ? estimatedShares - amountNum // Potential profit if resolves Yes
        : amountNum * priceForCalc;   // USDC you'll receive for selling

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

            {/* Action Toggle - 4 options */}
            <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                    onClick={() => setAction('buyYes')}
                    className={`py-2.5 text-sm font-semibold rounded-lg transition-colors ${action === 'buyYes'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 border border-gray-600/50'
                        }`}
                >
                    Buy Yes
                </button>
                <button
                    onClick={() => setAction('buyNo')}
                    className={`py-2.5 text-sm font-semibold rounded-lg transition-colors ${action === 'buyNo'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 border border-gray-600/50'
                        }`}
                >
                    Buy No
                </button>
                <button
                    onClick={() => setAction('sellYes')}
                    className={`py-2.5 text-sm font-semibold rounded-lg transition-colors ${action === 'sellYes'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 border border-gray-600/50'
                        }`}
                >
                    Sell Yes
                </button>
                <button
                    onClick={() => setAction('sellNo')}
                    className={`py-2.5 text-sm font-semibold rounded-lg transition-colors ${action === 'sellNo'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 border border-gray-600/50'
                        }`}
                >
                    Sell No
                </button>
            </div>

            {/* Amount Input */}
            <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-1">
                    {isBuyAction ? 'Amount (USDC)' : 'Shares to Sell'}
                </label>
                <div className="relative">
                    {isBuyAction && (
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    )}
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder={isBuyAction ? '0.00' : 'Enter shares'}
                        min={isBuyAction ? '1' : '0.01'}
                        step={isBuyAction ? '1' : '0.01'}
                        className={`w-full bg-gray-900/50 border border-gray-700/50 rounded-lg ${isBuyAction ? 'pl-7' : 'pl-4'} pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors`}
                    />
                </div>
                {/* Quick amount buttons */}
                <div className="flex gap-2 mt-2">
                    {(isBuyAction ? [10, 25, 50, 100] : [10, 50, 100, 250]).map((val) => (
                        <button
                            key={val}
                            onClick={() => setAmount(val.toString())}
                            className="flex-1 py-1 text-xs bg-gray-700/50 text-gray-400 hover:bg-gray-700 rounded transition-colors"
                        >
                            {isBuyAction ? `$${val}` : val}
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
                    {isBuyAction ? (
                        <>
                            {/* BUY Preview */}
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
                                <span className="text-gray-400">Potential Profit</span>
                                <span className="text-green-400">${estimatedProceeds.toFixed(2)}</span>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* SELL Preview */}
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-400">Shares to Sell</span>
                                <span className="text-white">{amountNum.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-400">Current Price</span>
                                <span className="text-white">{(priceForCalc * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between text-xs pt-1 border-t border-gray-700/30">
                                <span className="text-gray-400">You Receive</span>
                                <span className="text-green-400 font-medium">${estimatedProceeds.toFixed(2)}</span>
                            </div>
                        </>
                    )}
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

            {/* Approval Message & Button - Show different based on Buy/Sell */}
            <div className="mb-4 p-3 bg-gray-800/50 border border-gray-700/30 rounded-lg">
                {isBuyAction ? (
                    <>
                        <p className="text-xs text-gray-400 mb-2">
                            💡 First time trading? Approve USDC before placing orders (gas-free via Privy):
                        </p>
                        <button
                            onClick={async () => {
                                const success = await approveUSDC();
                                if (success) {
                                    setNeedsApproval(false);
                                    setError(null);
                                    setSuccessMessage('USDC approved! You can now place buy orders.');
                                }
                            }}
                            disabled={isApprovingUSDC}
                            className="w-full py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white rounded-lg transition-colors"
                        >
                            {isApprovingUSDC ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Approving USDC (gas sponsored)...
                                </span>
                            ) : (
                                '🔓 Approve USDC for Buying'
                            )}
                        </button>
                        {approvalError && (
                            <p className="text-xs text-red-400 mt-2">{approvalError}</p>
                        )}
                    </>
                ) : (
                    <>
                        <p className="text-xs text-gray-400 mb-2">
                            💡 First time selling? Approve your tokens for the exchange (gas-free via Privy):
                        </p>
                        <button
                            onClick={async () => {
                                const success = await approveCTF();
                                if (success) {
                                    setNeedsApproval(false);
                                    setError(null);
                                    setSuccessMessage('Tokens approved! You can now sell your positions.');
                                }
                            }}
                            disabled={isApprovingCTF}
                            className="w-full py-2 text-xs font-medium bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 text-white rounded-lg transition-colors"
                        >
                            {isApprovingCTF ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Approving tokens (gas sponsored)...
                                </span>
                            ) : (
                                '🔓 Approve Tokens for Selling'
                            )}
                        </button>
                        {ctfApprovalError && (
                            <p className="text-xs text-red-400 mt-2">{ctfApprovalError}</p>
                        )}
                    </>
                )}
            </div>

            {/* Submit Button */}
            <button
                onClick={handleSubmit}
                disabled={isSubmitting || !amount}
                className={`w-full py-3 text-sm font-semibold rounded-lg transition-colors ${action === 'buyYes' || action === 'buyNo'
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
                    `${action === 'buyYes' ? 'Buy Yes' :
                        action === 'buyNo' ? 'Buy No' :
                            action === 'sellYes' ? 'Sell Yes' : 'Sell No'
                    } - $${amountNum.toFixed(2)}`
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
