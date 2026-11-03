# Groww Trade Connect

Groww Trade Connect is a multi-market trading desk and research workspace designed for Nifty 100, crypto, NASDAQ, and ETF analysis. It blends a React + TypeScript frontend with a Node.js/Express backend to deliver a modern market dashboard for signal discovery, strategy experimentation, and AI-assisted research.

This repository is structured as a prototype trading environment for exploration and simulation, with demo workflows and API hooks intended to support future broker integrations and production-grade trading systems.

## Highlights

- Multi-market dashboard across Nifty, crypto, NASDAQ, and ETFs
- Signal generation using moving-average crossover logic
- Ranked stock and strategy boards for comparative analysis
- Monte Carlo simulation for trade scenarios
- Breakout and retest scanning for technical setups
- Market news and AI-assisted research support
- Session-aware authentication and demo/sample access
- Extensible backend for automation, broker config, and market data

## Tech Stack

- Frontend: React, TypeScript, Vite
- Styling: Tailwind CSS
- Backend: Node.js, Express
- Real-time data: WebSockets
- Analytics: custom technical analysis and simulation logic
- AI integration: Gemini API or local Ollama-compatible model support

## Repository Structure

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
│   ├── broker-manager.ts
│   ├── data-adapter.ts
│   ├── groww-service.ts
│   ├── market-data.ts
│   ├── news-service.ts
│   ├── session-policy.mjs
│   ├── security-policy.mjs
│   └── api-access.mjs
├── tests/
├── docs/
├── public/
├── vite.config.ts
└── README.md
```

## Features

### Market intelligence and analytics

- Universe browsing by market and symbol
- Historical candle and quote retrieval
- Signal scanning based on short and long moving averages
- Strategy backtesting with comparative rank metrics
- Market heatmap and failover monitoring for provider resilience

### AI and research tools

- Symbol-specific AI research workflow using historical evidence
- News-based signal context and catalyst grounding
- Local or configured AI infrastructure support
- Authenticated AI research performance trends for run latency and completion rate
- Metrics are held in memory per server process, capped at 250 runs and retained for up to 7 days; only timestamps, durations, and completion flags are stored

### Broking and automation scaffolding

- Groww session handling and profile APIs
- Multi-broker configuration support
- Algo-order and GTT-style simulation logic
- Automation state persistence and execution workflow scaffolding

## Getting Started

### Prerequisites

- Node.js 22+
- npm or Bun
- Optional: Gemini API credentials or a local Ollama instance for AI features

### Install dependencies

```bash
npm install
```

Or:

```bash
bun install
```

### Environment setup

```bash
cp .env.example .env
```

Set these values as needed:

- `GEMINI_API_KEY` (optional; enables Gemini-powered market-news briefings)
- `APP_URL` (when required by your hosting environment)
- `AI_ENABLED`, `AI_MODEL`, and `AI_OLLAMA_URL` (Ollama settings; no API key required)

### Run locally

```bash
npm run dev
```

The app runs the Express backend and Vite development server, typically on port `3000` unless overridden.

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

## Demo Mode

The project includes a sample/demo flow for testing the platform without a fully authenticated session. This is useful for evaluating the trading desk, analysis engine, and UI in an easy-to-run environment.

## API-key login behind a reverse proxy

If the login screen says **"A matching request Origin is required"**, configure `APP_PUBLIC_ORIGIN` on the Node hosting service to the application's **exact public HTTPS origin** (e.g. `https://desk.example.com`), then restart the server. Hosted environments with a valid `APP_URL` use it automatically. The error is produced by the app's CSRF guard **before broker authentication**, not by an incorrect API key.

[Detailed setup and credential-free verification](docs/PROXY_ORIGIN_LOGIN_FIX.md)

## Security and Operational Notes

- API routes enforce origin validation and session checks
- Privileged mutation endpoints are intentionally restricted in prototype mode
- Execution logic is sandboxed and should not be treated as a production-grade order system
- The repository is intended for research, experimentation, and internal prototyping

## License

This repository does not currently include a license file. If you plan to distribute or reuse the code publicly, add an appropriate license before publishing.

## Contributing

Contributions are welcome. If you are improving analytics, expanding coverage, refining safety checks, or building real integrations, open a pull request with a clear description of the changes and expected impact.

---

Built for market research, technical signal exploration, and trading desk experimentation.
