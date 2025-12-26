'use client';

import { LoginButton, WalletInfo, DisconnectButton, ProxyWallet, FundWallet } from '@/components/wallet';
import { useProxyWallet } from '@/hooks/useProxyWallet';

// Wallet Dashboard - combines ProxyWallet and FundWallet
function WalletDashboard() {
  const { proxyWalletAddress, hasProxyWallet, refreshBalance, refreshUsdcBalance } = useProxyWallet();

  const handleFundingComplete = () => {
    // Refresh balances after funding
    refreshBalance();
    refreshUsdcBalance();
  };

  return (
    <div className="w-full max-w-md space-y-6">
      {/* Proxy Wallet Section */}
      <ProxyWallet showFunding={false} />

      {/* Fund Wallet Section - only show if proxy wallet exists */}
      {hasProxyWallet && (
        <FundWallet
          proxyWalletAddress={proxyWalletAddress}
          onFundingComplete={handleFundingComplete}
          onBalanceUpdate={handleFundingComplete}
        />
      )}
    </div>
  );
}

export default function Home() {
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
      <main className="flex flex-col items-center justify-center px-6 py-20">
        <div className="text-center max-w-2xl">
          <h2 className="text-4xl font-bold text-white mb-4 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Welcome to Polymarket Trading
          </h2>
          <p className="text-lg text-gray-400 mb-8">
            Connect your wallet to start trading on prediction markets with enhanced order types
            and gas-sponsored transactions.
          </p>

          <div className="flex flex-col items-center gap-6">
            <LoginButton />

            <div className="grid grid-cols-3 gap-6 mt-8">
              <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
                <div className="text-2xl mb-2">🔐</div>
                <h3 className="text-white font-medium mb-1">Secure Auth</h3>
                <p className="text-sm text-gray-400">Privy-powered authentication</p>
              </div>
              <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
                <div className="text-2xl mb-2">⛽</div>
                <h3 className="text-white font-medium mb-1">Gas Sponsored</h3>
                <p className="text-sm text-gray-400">No gas fees for trading</p>
              </div>
              <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
                <div className="text-2xl mb-2">📊</div>
                <h3 className="text-white font-medium mb-1">Market & Stop Orders</h3>
                <p className="text-sm text-gray-400">Enhanced order types</p>
              </div>
            </div>

            {/* Wallet Dashboard */}
            <div className="mt-8">
              <WalletDashboard />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

