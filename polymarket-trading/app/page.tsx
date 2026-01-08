'use client';

import { useState } from 'react';
import { LoginButton, WalletInfo, DisconnectButton, WalletCard } from '@/components/wallet';
import { MarketList } from '@/components/markets';
import { usePrivy } from '@privy-io/react-auth';
import type { SimplifiedMarket } from '@/lib/polymarket';

// Selected Market Display
function SelectedMarketInfo({ market }: { market: SimplifiedMarket | null }) {
  if (!market) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6 text-center">
        <p className="text-gray-500">Select a market to view details</p>
      </div>
    );
  }

  const yesToken = market.tokens?.find(t => t.outcome === 'Yes');
  const noToken = market.tokens?.find(t => t.outcome === 'No');

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6">
      <h3 className="text-lg font-semibold text-white mb-4">{market.question}</h3>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Yes</p>
          <p className="text-2xl font-bold text-green-400">
            {yesToken?.price ? `${(yesToken.price * 100).toFixed(1)}%` : '—'}
          </p>
        </div>
        <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">No</p>
          <p className="text-2xl font-bold text-red-400">
            {noToken?.price ? `${(noToken.price * 100).toFixed(1)}%` : '—'}
          </p>
        </div>
      </div>

      {market.end_date_iso && (
        <p className="text-xs text-gray-500">
          Resolution: {new Date(market.end_date_iso).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

export default function Home() {
  const { authenticated, ready } = usePrivy();
  const [selectedMarket, setSelectedMarket] = useState<SimplifiedMarket | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-lg">P</span>
          </div>
          <h1 className="text-xl font-semibold text-white">Polymarket Trading</h1>
        </div>

        <div className="flex items-center gap-4">
          <WalletInfo />
          <DisconnectButton />
          <LoginButton />
        </div>
      </header>

      {/* Main Content */}
      <main className="px-6 py-8">
        {!ready ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !authenticated ? (
          /* Landing / Not Authenticated */
          <div className="flex flex-col items-center justify-center py-12">
            <h2 className="text-4xl font-bold text-white mb-4 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent text-center">
              Welcome to Polymarket Trading
            </h2>
            <p className="text-lg text-gray-400 mb-8 text-center max-w-xl">
              Connect your wallet to start trading on prediction markets with enhanced order types
              and gas-sponsored transactions.
            </p>

            <LoginButton />

            <div className="grid grid-cols-3 gap-6 mt-12">
              <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50 text-center">
                <div className="text-2xl mb-2">🔐</div>
                <h3 className="text-white font-medium mb-1">Secure Auth</h3>
                <p className="text-sm text-gray-400">Privy-powered authentication</p>
              </div>
              <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50 text-center">
                <div className="text-2xl mb-2">⛽</div>
                <h3 className="text-white font-medium mb-1">Gas Sponsored</h3>
                <p className="text-sm text-gray-400">No gas fees for trading</p>
              </div>
              <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50 text-center">
                <div className="text-2xl mb-2">📊</div>
                <h3 className="text-white font-medium mb-1">Market & Stop Orders</h3>
                <p className="text-sm text-gray-400">Enhanced order types</p>
              </div>
            </div>

            {/* Preview Markets (read-only) */}
            <div className="w-full max-w-4xl mt-12">
              <h3 className="text-xl font-semibold text-white mb-4 text-center">Explore Markets</h3>
              <MarketList maxMarkets={10} />
            </div>
          </div>
        ) : (
          /* Authenticated - Trading Dashboard */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Wallet Section */}
            <div className="lg:col-span-1 space-y-6">
              <WalletCard />
              <SelectedMarketInfo market={selectedMarket} />
            </div>

            {/* Right: Markets */}
            <div className="lg:col-span-2">
              <MarketList
                onSelectMarket={setSelectedMarket}
                selectedMarketId={selectedMarket?.condition_id}
                maxMarkets={20}
                enableNavigation={true}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
