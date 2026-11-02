# Groww Trade Connect — Local AI Agent Mode (read-only beta)

This feature follows the **agent harness** architecture described in
[freeCodeCamp: How to Build an AI Agent Harness from Scratch in TypeScript](https://www.freecodecamp.org/news/how-to-build-an-ai-agent-harness-from-scratch-in-typescript/).
The model **requests** tools, but the server controls validation, execution, budgets, and trace events.

## Quick start (free local inference)
1. Install [Ollama](https://ollama.com/download) **on the machine hosting the Node app**.
2. Run `ollama pull qwen3:4b` (approximately 2.5 GB model download; disk/CPU/RAM/electricity are not free).
3. Start Ollama (`ollama serve` if it is not already running).
4. Set `AI_ENABLED=true`, `AI_MODEL=qwen3:4b`, `AI_OLLAMA_URL=http://127.0.0.1:11434` in the server configuration.
5. Start the app, authenticate your **single-user** desk, open **Algo Signals**, select **AI Agent**, check the model health, choose a symbol and run research.
6. To turn off the feature immediately, set `AI_ENABLED=false` and restart the Node server.

The Ollama HTTP endpoint is **server-side and loopback-only**; arbitrary external URLs and user-supplied model endpoints are rejected. No API key or cloud account is required. On remote/cloud hosting, Ollama must be installed and reachable on that server; it cannot see an Ollama instance on your personal computer without a securely configured tunnel (not implemented).

## Application modes
- **Normal Algo**: Existing deterministic breakout scanner and simulated paper orders.
- **AI Agent**: Local Qwen3 analysis using only read-only evidence, historical SMA backtest, hypothetical risk checks and permission disclosure.
- Both modes operate under the existing platform restrictions. **The AI has no order placement tools** and never invokes broker APIs, a shell, a repository writer, or account secrets.

## Harness controls
| Boundary | Enforced |
| --- | --- |
| Tool calls | Named allowlist; strict argument validators; unknown/invalid calls cannot execute |
| Agent budgets | Up to 4 model steps, 8 tool calls, 45-second deadline |
| Context | 12,000-character provider-facing transcript window; bounded tool responses |
| Tracing | Ordered run ID and non-sensitive model/tool timing events |
| Model | Provider-independent harness, Ollama adapter |
| Inference | Locally hosted only, no unrestricted network adapter |
| Input | Server-side constituent allowlist, `market`/symbol validation, 160-character focus |
| Authentication | AI inference endpoint requires authenticated cookie and same-origin POST |
| Rate limiting | 1 AI request per authenticated session per 30 seconds |
| Data | Provider-sourced, bounded and dated daily close candles only; stale/synthetic Nifty is blocked |
| Evidence gate | All four required tools must succeed before the model answer is displayed |
| Actions | **Read-only**. No live or paper trade authorization, ever, from this feature |

## Testing
`bun run test:ai-harness` executes deterministic fake-model and mock-Ollama tests without requiring Ollama or an API key. Existing CI also runs TypeScript, full build, trading security suites and Chromium desktop/mobile toggle checks. A successful CI does **not** validate the quality, latency or profitability of a real local LLM; run an independent evaluation with a fixed historical dataset before considering any deployment beyond research.

## Known production blockers
- No broker order acknowledgements, verified live Nifty history, authenticated multi-user separation, or real account reconciliation.
- Historical sample rule tests omit slippage, commissions and compounding. A positive backtest is not a trade approval.
- The inference model may hallucinate, fail to call tools, or hit time limits. Failed evidence checks produce **NO verified conclusion**.
- Local model performance depends on deployment hardware; no real-model performance benchmark has been established.
- Do not expose Ollama or this application directly to the public internet without additional network controls, monitoring and independent security assessment.

The preexisting guarded trading REST mutations remain HTTP 503; this feature does not remove any of those protections.
