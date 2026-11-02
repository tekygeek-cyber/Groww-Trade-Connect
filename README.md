# Groww Trade Connect

Groww Trade Connect is a multi-market trading desk and market research workspace for Nifty 100, crypto, NASDAQ, and ETF universes. It combines a React frontend with a Node/Express backend to provide quote monitoring, crossover scanning, Monte Carlo simulation, strategy backtesting, breakout analysis, AI-assisted research, and a sample/demo trading workflow.

This project is designed for research, simulation, and UI exploration. It is not a production brokerage or order-routing system, and many execution endpoints are intentionally limited or demo-only.

## Highlights

- Multi-market desk covering Nifty, Crypto, NASDAQ, and ETFs
- Real-time-like quote and market snapshot views
- SMA crossover scanning and rank-based signal discovery
- Monte Carlo simulation for selected tickers
- Strategy backtesting and board-style comparison views
- Breakout and retest scanner for market setup detection
- AI research endpoint using local or configured model support
- Session-based authentication and demo/sample access flow
- Structured backend APIs for signals, news, automation, and broker configuration

## Tech Stack

- Frontend: React + TypeScript + Vite
- Styling: Tailwind CSS
- Backend: Node.js + Express + WebSockets
- Data/analytics: custom market simulation, technical analysis, and ranking logic
- AI integration: Google Gemini / local Ollama-compatible model support

## Project Structure

```text
.
├── .env.example
├── .gitignore
├── bun.lock
├── index.html
├── metadata.json
├── package.json
├── server.ts
├── src/
│   ├── App.tsx
│   ├── components/
│   ├── data/
│   ├── lib/
│   ├── types/
│   ├── index.css
│   └── main.tsx
├── server/
│   ├── ai/
│   ├── groww-service.ts
│   ├── market-data.ts
│   ├── news-service.ts
│   ├── broker-manager.ts
│   ├── data-adapter.ts
│   ├── session-policy.mjs
│   ├── security-policy.mjs
│   └── api-access.mjs
├── tests/
├── docs/
├── public/
└── vite.config.ts
```

## Features

### Market desk and signals

The app exposes a trading desk with:

- universe browsing by market
- historical candle retrieval
- price and change trackers
- signal scanning based on short/long moving averages
- Monte Carlo simulation for candidate trades
- rank-based stock board and strategy summaries

### Market intelligence

Included services provide:

- market news retrieval
- symbol-specific catalyst context
- AI research support grounded in historical candles and market data
- failover and provider health monitoring for data adapters

### Broker / automation layer

The backend contains hooks for:

- Groww session handling
- multi-broker status/configuration
- GTT-style dummy order simulation
- automation state persistence and market execution workflows

These pieces are organized as a prototype/demo architecture and may be extended for real integrations.

## Getting Started

### Prerequisites

- Node.js 22+
- npm or bun
- Optional: a local Ollama instance or Gemini API access for AI features

### Install dependencies

```bash
npm install
```

Or with Bun:

```bash
bun install
```

### Environment configuration

Copy the example environment file and adjust it to your setup:

```bash
cp .env.example .env
```

Example values include:

- `GEMINI_API_KEY` for Gemini-backed AI usage
- `APP_URL` for app self-reference and callback flows
- `AI_ENABLED=true` and `AI_MODEL=qwen3:4b` for local model usage
- `AI_OLLAMA_URL=http://127.0.0.1:11434` for local Ollama access

### Run the app locally

```bash
npm run dev
```

The app starts the Express server and Vite development environment. By default it listens on port `3000` unless overridden via the `PORT` environment variable.

## Available Scripts

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run test
npm run test:auth-integration
npm run test:rebalance
npm run test:market-integrity
npm run test:ai-harness
```

## Sample / Demo Mode

A sample workflow is supported through the app's `?sample=true` mode or demo endpoints. This allows you to test the UI and signal pipeline without requiring a full authenticated session.

## Security and operational notes

- The backend enforces origin checks and session validation for API routes.
- Privileged mutation routes are intentionally blocked until stronger auth and reconciliation are implemented.
- AI endpoints are read-only in spirit and do not include live brokerage execution tools.
- This repository is best suited for demo, education, and internal research workflows.

## Notes

This project is a trading desk prototype and should be treated as a learning/demo platform rather than a production brokerage application. Real-world trading systems require rigorous validation, audit trails, compliance review, and secure authentication across all execution paths.

## License

This repository does not currently declare a license file. If you plan to distribute or reuse the code publicly, add a license before publishing.

## Contributing

Contributions are welcome. If you want to improve the market engine, add instrumentation, or extend broker support, open a pull request with a clear description of the change and expected behavior.
