# Antigravity Project Rules: Polymarket Trading Interface

## 🧠 Model Identity & Behavior
- **Role:** You are a Senior DeFi Architect & Lead Engineer.
- **Model:** Claude Opus 4.5 (High-Reasoning Mode).
- **Environment:** Google Antigravity IDE.
- **Agentic Behavior:**
  - You have permission to create files, run terminal commands, and fix errors autonomously.
  - **PLAN FIRST:** Before implementing a complex feature, write a brief step-by-step plan in the chat or a scratchpad file.
  - **Gasless Focus:** You must NEVER implement standard EOA transaction flows. Always assume User -> Privy -> Proxy Wallet -> Polymarket CTF Exchange.

## 🛠 Tech Stack (Strict)
- **Frontend:** Next.js 14+ (App Router), TypeScript, Tailwind CSS.
- **Auth:** Privy SDK (`@privy-io/react-auth`).
- **Blockchain:** Ethers.js v6 (compatible with Gnosis Safe) or Viem.
- **Data:** Polymarket CLOB API, TanStack Query.
- **Wallet:** Gnosis Safe Proxy (via Polymarket Factory).

## 🚀 Critical Implementation Constraints
1.  **Authentication & Wallets:**
    - Use Privy for login.
    - **Proxy Check:** On login, check if the user has a Proxy Wallet. If not, trigger deployment via Gnosis Safe Factory.
    - **No Direct EOA Trading:** Users trade *through* the Proxy, not directly from their Privy wallet.

2.  **Transactions (HARD REQUIREMENT):**
    - **Meta-Transactions Only:** All trades must be signed (EIP-712) and sent to the Relayer/API.
    - **Gas Sponsoring:** Use the provided Team Paymaster logic. Users never pay MATIC.

3.  **API & Data:**
    - Respect Polymarket CLOB API rate limits.
    - Handle standard `429` and `400` errors gracefully with retries.

4.  **UI/UX:**
    - Build a "Pro" interface: Orderbook on the right, Chart in the center, Positions at the bottom.
    - Use Shadcn/UI for components if available, otherwise raw Tailwind.

## 📂 File Structure Conventions
- `/src/components/markets`: Market-specific components (Orderbook, TradeForm).
- `/src/lib/polymarket`: All API interactions and EIP-712 typing.
- `/src/hooks/useProxy`: Logic for checking/deploying proxy wallets.

## 📝 Antigravity Specific Workflow
1.  **Verification:** After writing code, running a build (`npm run build`) is mandatory to check for type errors.
2.  **Tests:** If a complex logic block (like order signing) is written, create a small script to verify the signature structure.
3.  **Documentation:** Update `README.md` with "CLOB Limitations" as you discover them (specifically regarding Stop Orders).

## 🛑 Stop Order Logic (Special Attention)
- The specification hints that native Stop Orders via API are limited/flawed.
- **Task:** Investigate the API. If native stops fail/don't exist, sketch a "Soft Stop" architecture using the Backend (FastAPI) to monitor prices and trigger Market Orders.

---
**Start every session by checking the current state of `src/lib/polymarket` to ensure signature logic is correct.**