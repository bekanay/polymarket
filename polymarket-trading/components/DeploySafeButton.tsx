/**
 * DeploySafeButton Component
 *
 * Example component demonstrating usage of the useDeploySafe hook.
 * Provides a button to deploy a Gnosis Safe and displays the result.
 */

'use client';

import { useDeploySafe } from '@/hooks/useDeploySafe';
import { usePrivy } from '@privy-io/react-auth';

export function DeploySafeButton() {
    const { authenticated, ready, login } = usePrivy();
    const {
        deploySafe,
        reset,
        isDeploying,
        isDeployed,
        safeAddress,
        transactionHash,
        error,
    } = useDeploySafe();

    // Show loading state while Privy initializes
    if (!ready) {
        return (
            <div className="deploy-safe-container">
                <p className="loading-text">Loading...</p>
            </div>
        );
    }

    // Show login button if not authenticated
    if (!authenticated) {
        return (
            <div className="deploy-safe-container">
                <p className="info-text">Please login to deploy a Safe wallet</p>
                <button
                    onClick={login}
                    className="deploy-button login-button"
                >
                    Login with Privy
                </button>
            </div>
        );
    }

    // Handle deploy click
    const handleDeploy = async () => {
        const address = await deploySafe();
        if (address) {
            console.log('Safe deployed successfully at:', address);
        }
    };

    return (
        <div className="deploy-safe-container">
            <h3 className="section-title">Gnosis Safe Deployment</h3>

            {/* Error display */}
            {error && (
                <div className="error-message">
                    <p><strong>Error:</strong> {error}</p>
                    <button onClick={reset} className="reset-button">
                        Try Again
                    </button>
                </div>
            )}

            {/* Success display */}
            {isDeployed && safeAddress && (
                <div className="success-message">
                    <p><strong>✓ Safe Deployed Successfully!</strong></p>
                    <div className="address-display">
                        <label>Safe Address:</label>
                        <code>{safeAddress}</code>
                    </div>
                    {transactionHash && (
                        <div className="tx-display">
                            <label>Transaction:</label>
                            <a
                                href={`https://polygonscan.com/tx/${transactionHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="tx-link"
                            >
                                View on Polygonscan
                            </a>
                        </div>
                    )}
                    <button onClick={reset} className="reset-button">
                        Deploy Another
                    </button>
                </div>
            )}

            {/* Deploy button */}
            {!isDeployed && !error && (
                <div className="deploy-section">
                    <p className="info-text">
                        Deploy a Gnosis Safe wallet for trading on Polymarket.
                        Gas fees are covered by the Polymarket relayer.
                    </p>
                    <button
                        onClick={handleDeploy}
                        disabled={isDeploying}
                        className={`deploy-button ${isDeploying ? 'deploying' : ''}`}
                    >
                        {isDeploying ? (
                            <>
                                <span className="spinner"></span>
                                Deploying Safe...
                            </>
                        ) : (
                            'Deploy Safe Wallet'
                        )}
                    </button>
                </div>
            )}

            <style jsx>{`
        .deploy-safe-container {
          padding: 1.5rem;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          max-width: 480px;
          margin: 1rem auto;
        }

        .section-title {
          margin: 0 0 1rem 0;
          font-size: 1.25rem;
          color: #fff;
          font-weight: 600;
        }

        .loading-text,
        .info-text {
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 1rem;
          font-size: 0.9rem;
        }

        .deploy-button {
          width: 100%;
          padding: 0.875rem 1.5rem;
          font-size: 1rem;
          font-weight: 600;
          color: #fff;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .deploy-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
        }

        .deploy-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .deploy-button.deploying {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
        }

        .login-button {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        }

        .login-button:hover {
          box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4);
        }

        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .error-message {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1rem;
        }

        .error-message p {
          color: #fca5a5;
          margin: 0 0 0.75rem 0;
          font-size: 0.9rem;
        }

        .success-message {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: 8px;
          padding: 1rem;
        }

        .success-message p {
          color: #6ee7b7;
          margin: 0 0 0.75rem 0;
        }

        .address-display,
        .tx-display {
          margin-bottom: 0.75rem;
        }

        .address-display label,
        .tx-display label {
          display: block;
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.8rem;
          margin-bottom: 0.25rem;
        }

        .address-display code {
          display: block;
          background: rgba(0, 0, 0, 0.3);
          padding: 0.5rem;
          border-radius: 4px;
          font-family: monospace;
          font-size: 0.85rem;
          color: #a5b4fc;
          word-break: break-all;
        }

        .tx-link {
          color: #60a5fa;
          text-decoration: none;
          font-size: 0.9rem;
        }

        .tx-link:hover {
          text-decoration: underline;
        }

        .reset-button {
          margin-top: 0.75rem;
          padding: 0.5rem 1rem;
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.8);
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .reset-button:hover {
          background: rgba(255, 255, 255, 0.15);
        }
      `}</style>
        </div>
    );
}

export default DeploySafeButton;
