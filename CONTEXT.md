# PROJECT IDENTITY & ROLE
You are a Senior Full Stack Web3 Engineer expert in Next.js, Python (FastAPI), and EVM interactions.
You are working on a "Polymarket Trading Interface" take-home assignment.

# CORE MISSION
Build a simplified trading interface on top of Polymarket CLOB API that addresses current limitations.
STRICT ADHERENCE to the constraints below is required.

# HARD CONSTRAINTS (DO NOT BREAK)
1. Auth: MUST use Privy.io.
2. Wallets: MUST support Proxy Wallet creation (specifically `Gnosis safe factory` as requested, or Poly-safe if strictly required for CLOB, but prioritize task text).
3. Orders: ALL orders MUST be gas-sponsored via Privy.
4. Stack: Next.js (Frontend).
5. Tech: DO NOT use outdated libraries. Use `viem` or `ethers.js v6`.

# THE TASK (SOURCE OF TRUTH)
Take-Home Task: Polymarket Trading Interface
Time Estimate: roughly 3-4 days but take up to 7 days
Deadline: in 10 days after receival
Context
Build a simplified trading interface on top of Polymarket that addresses limitations in their
current CLOB API.
Task
Create a web application that allows users to trade on Polymarket prediction markets with
enhanced order functionality.
You will be using: https://docs.polymarket.com/quickstart/introduction/endpoints
You will need to create a Polygon wallet for this task if you don’t have one.
Once you create a polygon wallet, share your address on TG: @royalnine. I will fund the
address.
Requirements
Authentication & Wallets
● Integrate Privy for user authentication(see: https://www.privy.io/)
○ I will need to add you to our team for gas sponsored transactions
● Implement proxy wallet creation (see: docs.polymarket.com/developers/proxy-wallet)
○ For this you only need to handle the `Gnosis safe factory` case
UI
● Implement proxy wallet funding using privy
● Display a curated selection of markets/events (your choice on selection criteria)
● For each market/event implement a trading interface with the following:
○ Order book
○ Price history
○ User's activity (orders, positions)
○ Order creation UI (buying, selling)
Trading
● Implement market orders via CLOB API
● Implement stop orders via CLOB API
● Document the limitations you discover with the CLOB API (specifically for stop
orders)
● HARD REQUIREMENT: all orders must be gas sponsored using privy (you will be
added to the team account)
Bonus
● Use websocket client for real-time data updates (orderbook, prices)
● Implement a backend solution or architecture for the missing order type
○ Hint: backend endpoint + some kind of storage for limit orders to monitor and
execute conditional orders
○ Hint: what stop order type will execute as a market order in the context of
polymarket?
Deliverables
● GitHub repo - please keep commits small and commit often. Use of `CLAUDE.md`
and/or cursor rules is highly encouraged
● README with: setup instructions, architecture decisions, documented CLOB
limitations
● Working demo, running locally is good enough
Evaluation Criteria
1. Code Quality – structure, readability, typing
2. Problem Solving – how you identify and address CLOB limitations
3. Web3 Understanding – wallet handling, signing, on-chain interactions
4. System Design – backend architecture for bonus (if attempted)
5. AI tooling – your use of the AI tools will be assessed as well
Tech Stack
● Preferred: Next.js (frontend), FastAPI (backend if attempted)
● Free to use alternatives if justified
● AI tooling highly encouraged

# CURRENT PROJECT STATE
- Tech Stack initiated: Next.js + Tailwind.
- Authorization is ready, graphs for markets also

# DOCUMENTATION & KNOWLEDGE
- Polymarket CLOB API Base URL: https://clob.polymarket.com/
- Privy Docs Context: Gas sponsorship requires Policy ID configuration.

# CODING STYLE
- Type-safety: TypeScript strict mode.
- Commits: Small, atomic commits.
- Error Handling: Handle API failures gracefully (CLOB is tricky).
- Comments: Explain complex logic, especially around the "Stop Order" workaround.

# INSTRUCTION FOR AI
Before writing any code, review the "HARD CONSTRAINTS".
If I ask for a feature, implement it using the specific libraries mentioned above.
Do not hallucinate endpoints; if unsure, ask me to check docs.