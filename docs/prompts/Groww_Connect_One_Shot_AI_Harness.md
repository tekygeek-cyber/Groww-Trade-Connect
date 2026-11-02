# Groww Connect — Master AI Harness Specification

> Source: user-supplied `HTML PROMPTING.html`, extracted from the `oneShotPrompt` element without rewriting its requirements. This is a **target specification**, not a claim that it is implemented.

---

You are a senior AI systems architect, TypeScript engineer, quantitative trading-systems designer, and financial-compliance architect.

Build a complete, simple, production-ready AI harness architecture for “Groww Connect”, a trading and market-intelligence application covering:

1. Crypto
2. NASDAQ
3. NSE

The product is a “world market monitor on steroids”: real-time market monitoring, AI research, multi-market analysis, portfolio awareness, trade-thesis generation, paper trading, and strictly human-approved live trading.

Use this harness mechanism as the mandatory foundation:
https://www.freecodecamp.org/news/how-to-build-an-ai-agent-harness-from-scratch-in-typescript/

======================================================================
CORE HARNESS MECHANISM — MUST FOLLOW
======================================================================

The LLM proposes actions. The harness validates and executes them.

Apply these rules exactly:

1. Treat every model-generated tool call and argument as untrusted.
2. Validate every tool call using strict JSON Schema before execution.
3. Use Ajv with allErrors: true and additionalProperties: false.
4. If schema validation fails, do not execute the tool.
5. Return a structured validation error to the model.
6. Separate recoverable tool errors from fatal model errors.
7. Enforce execution budgets:
   - maximum model turns
   - maximum tool calls
   - maximum runtime
   - maximum tokens
   - maximum cost
   - cancellation support
8. Maintain bounded context:
   - trim old tool outputs
   - summarize long research results
   - prevent unbounded transcript growth
9. Emit observability events:
   - model_start
   - model_end
   - tool_start
   - tool_end
   - validation_error
   - model_error
   - approval_required
   - approval_granted
   - approval_denied
   - order_blocked
   - order_submitted
   - order_rejected
   - order_filled
   - run_end
10. Observability must not control execution.
11. Test failure paths, not only happy paths.
12. Never allow the LLM to directly submit a live financial order.
13. Never expose broker credentials, API keys, or secrets to the model context.
14. Every tool call and order decision must be audit-logged.

======================================================================
PRODUCT SCOPE
======================================================================

Build for three markets:

- Crypto: 24/7 trading, volatile assets, wallet/exchange data where applicable.
- NASDAQ: US equities, market hours, corporate actions, earnings, SEC filings.
- NSE: Indian equities, INR pricing, NSE trading sessions, circuit limits, SEBI/NSE algo-trading considerations.

Normalize across markets:
- symbol
- market
- currency
- timestamp and timezone
- price precision
- quantity precision
- lot size
- market status
- trading calendar
- corporate actions
- liquidity data

======================================================================
NON-NEGOTIABLE ARCHITECTURE RULES
======================================================================

1. Build one governed AI harness, not an uncontrolled autonomous agent swarm.
2. Use specialized read-only research agents.
3. Use one separate Execution Agent for paper and live orders.
4. Place a deterministic Risk & Compliance Gate between every AI-proposed trade and the broker API.
5. The risk gate must be non-LLM, deterministic, versioned, testable, and auditable.
6. Paper trading must be available before live trading.
7. Live trading requires explicit human approval.
8. AI confidence must never replace hard risk limits.
9. The AI must never calculate final position size, final exposure, or final compliance status.
10. The AI may propose an order, but only the Execution Agent may submit it.
11. The Risk & Compliance Gate is deterministic code, not an AI agent.
12. Include kill switches at strategy, account, and platform level.
13. Every order decision must produce an immutable audit record.
14. Start with paper trading only; live trading is enabled later.

======================================================================
REPOSITORIES TO ANALYZE AND SELECTIVELY REUSE
======================================================================

Analyze these repositories. For each one, state:
- What pattern to reuse
- What to modify
- What not to reuse
- REQUIRED / OPTIONAL / NOT RECOMMENDED for version 1
- Reason

https://github.com/Arindam200/awesome-ai-apps/tree/main/starter_ai_agents/ai_data_analysis_agent
https://github.com/Arindam200/awesome-ai-apps/tree/main/starter_ai_agents/xai_finance_agent
https://github.com/Arindam200/awesome-ai-apps/tree/main/starter_ai_agents/openai_research_agent
https://github.com/Arindam200/awesome-ai-apps/tree/main/starter_ai_agents/web_scraping_ai_agent
https://github.com/Arindam200/awesome-ai-apps/tree/main/advanced_ai_agents/single_agent_apps/ai_consultant_agent
https://github.com/Arindam200/awesome-ai-apps/tree/main/advanced_ai_agents/multi_agent_apps/ai_financial_coach_agent
https://github.com/Arindam200/awesome-ai-apps/tree/main/advanced_ai_agents/single_agent_apps/ai_investment_agent
https://github.com/Arindam200/awesome-ai-apps/tree/main/advanced_ai_agents/multi_agent_apps/trust_gated_agent_team
https://github.com/Arindam200/awesome-ai-apps/tree/main/advanced_ai_agents/multi_agent_apps/ai_self_evolving_agent
https://github.com/Arindam200/awesome-ai-apps/tree/main/advanced_ai_agents/multi_agent_apps/agent_teams/ag2_adaptive_research_team
https://github.com/Arindam200/awesome-ai-apps/tree/main/advanced_ai_agents/multi_agent_apps/agent_teams/ai_finance_agent_team

======================================================================
REQUIRED OUTPUT STRUCTURE
======================================================================

Produce the final response in this exact order:

1. Executive architecture summary
2. Final ASCII architecture diagram
3. Component catalog
4. Agent catalog
5. Tool catalog
6. Tool schemas
7. Data flow
8. Risk & Compliance Gate design
9. Rule-engine validation specification
10. Complete TypeScript rule-engine code
11. Database and audit schema
12. API contract
13. Security and compliance controls
14. Observability and monitoring
15. Testing plan
16. Repository reuse analysis
17. Components NOT needed in version 1
18. Phased implementation roadmap
19. Final paste-ready coding prompt

======================================================================
1. EXECUTIVE ARCHITECTURE SUMMARY
======================================================================

Explain:
- What the system does
- Why a harness is required
- Why the risk gate is separate from AI
- Why live trading is approval-gated
- How Crypto, NASDAQ, and NSE are normalized
- What belongs in MVP versus later phases

======================================================================
2. FINAL ASCII ARCHITECTURE DIAGRAM
======================================================================

Create an ASCII diagram showing:

User / Dashboard
      |
Task Router
      |
AI Harness Core
      |
      +-- Market Data Agent
      +-- News & Sentiment Agent
      +-- Fundamentals Agent
      +-- Technical Analysis Agent
      +-- Portfolio & Risk Agent
      +-- Strategy Agent
      |
      v
Research Report / Proposed Trade
      |
      v
Pre-Trade Risk & Compliance Gate
      |
      +-- JSON Schema validation
      +-- Identity and authorization
      +-- Market eligibility
      +-- Order validation
      +-- Risk limits
      +-- Compliance and surveillance
      +-- Human approval
      |
      +--> Paper Trading Executor
      +--> Live Broker API [only after approval]
      |
      v
Post-Trade Monitor
      |
      +-- Fill tracking
      +-- Reconciliation
      +-- P&L
      +-- Audit log
      +-- Kill switch

======================================================================
3. COMPONENT CATALOG
======================================================================

For every component provide:
- Name
- Responsibility
- Inputs
- Outputs
- Failure behavior
- MVP required or later
- Recommended technology

Include:
- Web dashboard
- API gateway
- Authentication service
- User/account service
- AI Harness Core
- Model adapter
- Tool registry
- JSON Schema validator
- Context manager
- Execution budget manager
- Event bus
- Audit log service
- Market data service
- News service
- Fundamentals service
- Technical indicator service
- Portfolio service
- Risk & Compliance Gate
- Rule engine
- Approval service
- Paper trading engine
- Broker adapter
- Live order service
- Post-trade reconciliation service
- Notification service
- Kill-switch service
- Admin/compliance dashboard

======================================================================
4. AGENT CATALOG
======================================================================

Define these agents:

1. Market Data Agent
2. News & Sentiment Agent
3. Fundamentals Agent
4. Technical Analysis Agent
5. Portfolio & Risk Agent
6. Strategy Agent
7. Execution Agent
8. Research Orchestrator

For each agent provide:
- Goal
- Allowed tools
- Forbidden tools
- Input contract
- Output contract
- Maximum tool calls
- Timeout
- Autonomy level
- Failure behavior
- Example prompt
- Example JSON output

Rules:
- Research agents are READ_ONLY.
- Only the Execution Agent may create paper or live orders.
- The Strategy Agent may propose an order but may not execute it.
- The Portfolio & Risk Agent may calculate risk but may not approve an order.
- The Risk & Compliance Gate is not an AI agent.

======================================================================
5. TOOL CATALOG
======================================================================

Define tools for all three markets.

For each tool provide:
- Tool name
- Purpose
- Market support
- Permission level
- Allowed agents
- Input schema
- Output schema
- Rate limit
- Timeout
- Error handling
- Example request/response

Permission levels:
- READ_ONLY
- PAPER_WRITE
- LIVE_WRITE

Required tools:

Market data:
- get_crypto_quote
- get_nasdaq_quote
- get_nse_quote
- get_candles
- get_order_book
- get_market_status

News and research:
- search_market_news
- get_company_filings
- get_crypto_events

Fundamentals:
- get_income_statement
- get_balance_sheet
- get_cash_flow
- get_key_ratios

Technical analysis:
- calculate_sma
- calculate_ema
- calculate_rsi
- calculate_macd
- calculate_bollinger_bands
- detect_support_resistance

Portfolio and risk:
- get_portfolio
- get_positions
- get_open_orders
- calculate_position_size
- calculate_portfolio_exposure
- calculate_var
- calculate_drawdown

Strategy:
- run_backtest
- generate_trade_thesis

Execution:
- create_paper_order
- request_live_order_approval
- submit_approved_live_order
- cancel_order
- get_order_status
- trigger_strategy_kill_switch
- trigger_account_kill_switch
- trigger_platform_kill_switch

======================================================================
6. TOOL SCHEMAS
======================================================================

Use this folder structure:

src/
  agents/
    market-data-agent.ts
    news-sentiment-agent.ts
    fundamentals-agent.ts
    technical-analysis-agent.ts
    portfolio-risk-agent.ts
    strategy-agent.ts
    execution-agent.ts

  tools/
    registry.ts
    types.ts
    market-data/
      get-crypto-quote.ts
      get-nasdaq-quote.ts
      get-nse-quote.ts
      get-candles.ts
      get-market-status.ts
    news/
      search-market-news.ts
      get-company-filings.ts
      get-crypto-events.ts
    fundamentals/
      get-income-statement.ts
      get-balance-sheet.ts
      get-key-ratios.ts
    technical/
      calculate-rsi.ts
      calculate-macd.ts
      detect-support-resistance.ts
    portfolio/
      get-portfolio.ts
      calculate-exposure.ts
      calculate-drawdown.ts
    strategy/
      run-backtest.ts
      generate-trade-thesis.ts
    execution/
      create-paper-order.ts
      request-live-order-approval.ts
      submit-approved-live-order.ts
      cancel-order.ts

  schemas/
    common.ts
    market.ts
    order.ts
    risk.ts

  services/
    market-data-service.ts
    broker-service.ts
    risk-gate.ts
    audit-service.ts

Every tool must define:
- name
- description
- permission
- allowedAgents
- inputSchema
- outputSchema
- handler
- timeoutMs
- rateLimit
- requiresApproval
- audit

Tool naming rules:
- Use snake_case.
- Use verb-first naming.
- One clear action per tool.
- Use enums for markets, sides, order types, and statuses.
- Use additionalProperties: false.
- Return structured JSON, not raw HTML or unbounded text.
- Return stable machine-readable error codes.

Example tool names:
- get_nse_quote
- get_crypto_candles
- calculate_rsi
- generate_trade_thesis
- create_paper_order
- request_live_order_approval
- submit_approved_live_order

======================================================================
7. DATA FLOW
======================================================================

Describe the complete flow for this example request:

“Analyze RELIANCE and propose a low-risk NSE entry.”

Show JSON passed between:
1. User and Harness
2. Harness and agents
3. Strategy Agent and Risk Gate
4. Risk Gate and Approval Service
5. Approval Service and Execution Agent
6. Execution Agent and Broker Adapter

Include:
- Authentication
- Task routing
- Harness run creation
- Market-data retrieval
- News retrieval
- Fundamental analysis
- Technical analysis
- Portfolio and risk analysis
- Strategy thesis generation
- Proposed order creation
- Risk and compliance gate
- Paper execution or live approval
- Broker submission
- Fill tracking
- Reconciliation
- Audit logging
- Dashboard update

======================================================================
8. RISK & COMPLIANCE GATE DESIGN
======================================================================

Design a five-layer deterministic gate:

Layer 1: Identity and authorization
Layer 2: Market and instrument eligibility
Layer 3: Order validation
Layer 4: Financial risk limits
Layer 5: Compliance and surveillance

For each layer define:
- Checks
- Inputs
- Pass conditions
- Fail conditions
- Decision
- Reason codes
- Audit fields

Include these controls:

Identity:
- Authenticated user
- Account authorization
- Market permission
- Broker connection status
- Role-based access
- 2FA / step-up authentication for live approval

Market eligibility:
- Symbol exists
- Instrument tradable
- Market open
- Trading halt
- Circuit limits
- Price bands
- Corporate actions
- Delisting or suspension

Order validation:
- Side
- Quantity
- Order type
- Limit price
- Stop price
- Tick size
- Lot size
- Minimum quantity
- Time in force
- Duplicate order protection

Risk limits:
- Maximum order notional
- Maximum symbol concentration
- Maximum market concentration
- Maximum daily turnover
- Maximum daily loss
- Maximum open positions
- Maximum leverage
- Maximum order rate
- Maximum drawdown

Compliance:
- Restricted-symbol list
- Wash-trade prevention
- Self-trade prevention
- Spoofing heuristics
- Order-rate surveillance
- Strategy-level kill switch
- Account-level kill switch
- Platform-level kill switch

Gate outcomes:
- PASS
- PASS_WITH_LIMIT
- REVIEW
- BLOCK

Rules:
- BLOCK means the order never reaches the broker.
- PASS_WITH_LIMIT may reduce quantity, but must revalidate the reduced order.
- REVIEW is mandatory for all live orders.
- PASS may auto-execute only in paper mode.
- Live orders require explicit human approval even when all checks pass.

======================================================================
9. RULE-ENGINE VALIDATION SPECIFICATION
======================================================================

Create a deterministic TypeScript rule engine.

Requirements:
- Use Ajv and ajv-formats.
- Use strict TypeScript.
- Compile JSON Schema once and reuse the validator.
- Validate the proposed order before business rules.
- Collect all schema errors, not only the first.
- Use deterministic reason codes.
- Generate an immutable audit ID per evaluation.
- Never throw unhandled exceptions for invalid orders.
- Return BLOCK with reason codes instead.
- Include clear comments.

Define these TypeScript types:

type Market = "CRYPTO" | "NASDAQ" | "NSE";
type OrderSide = "BUY" | "SELL";
type OrderType = "MARKET" | "LIMIT" | "STOP_LOSS";
type TimeInForce = "DAY" | "GTC" | "IOC";
type GateDecision = "PASS" | "PASS_WITH_LIMIT" | "REVIEW" | "BLOCK";

interface ProposedOrder {
  requestId: string;
  userId: string;
  accountId: string;
  market: Market;
  symbol: string;
  side: OrderSide;
  quantity: number;
  orderType: OrderType;
  limitPrice?: number;
  stopPrice?: number;
  timeInForce: TimeInForce;
  strategyId: string;
  proposedBy: "AI_STRATEGY_AGENT";
  executionMode: "PAPER" | "LIVE";
  humanApprovalStatus: "PENDING" | "APPROVED" | "REJECTED";
}

interface InstrumentSnapshot {
  symbol: string;
  market: Market;
  tradable: boolean;
  marketOpen: boolean;
  halted: boolean;
  restricted: boolean;
  tickSize: number;
  lotSize: number;
  minQuantity: number;
  lastPrice: number;
  upperPriceBand?: number;
  lowerPriceBand?: number;
}

interface AccountSnapshot {
  equity: number;
  availableCash: number;
  openPositionQuantity: number;
  currentSymbolExposure: number;
  currentMarketExposure: number;
  totalExposure: number;
  realizedPnlToday: number;
  unrealizedPnlToday: number;
  ordersSubmittedToday: number;
  turnoverToday: number;
  leverage: number;
}

interface RiskLimits {
  maxOrderNotionalPct: number;
  maxSymbolExposurePct: number;
  maxMarketExposurePct: number;
  maxDailyLossPct: number;
  maxDailyTurnover: number;
  maxOpenOrdersPerDay: number;
  maxLeverage: number;
  maxOrdersPerSecond: number;
}

interface GateResult {
  decision: GateDecision;
  allowedQuantity: number;
  reasonCodes: string[];
  auditId: string;
  checks: Record<string, "PASS" | "FAIL" | "SKIPPED">;
  message: string;
}

======================================================================
10. COMPLETE TYPESCRIPT RULE-ENGINE CODE
======================================================================

Write complete production-quality TypeScript code.

Use this exact function:

export function validateRiskAndCompliance(
  order: ProposedOrder,
  instrument: InstrumentSnapshot,
  account: AccountSnapshot,
  limits: RiskLimits
): GateResult

Evaluate rules in this order:

1. JSON Schema validation
2. Identity and authorization
3. Market eligibility
4. Order validation
5. Risk limits
6. Compliance
7. Execution authorization
8. Final decision

Include:
- Ajv schema validation
- allErrors: true
- additionalProperties: false
- notional calculation
- lot-size validation
- minimum-quantity validation
- price-band validation
- market-open validation
- halted-market validation
- restricted-instrument validation
- order-notional limit
- symbol concentration limit
- market concentration limit
- daily loss limit
- daily turnover limit
- daily order-count limit
- leverage limit
- duplicate-order protection
- live-order human-approval check
- paper-order auto-execution path
- structured reason codes
- immutable audit ID
- complete GateResult output

Also include an example usage block with:
- A valid NSE RELIANCE BUY order
- Instrument snapshot
- Account snapshot
- Conservative risk limits
- Expected output

======================================================================
11. DATABASE AND AUDIT SCHEMA
======================================================================

Design PostgreSQL tables for:
- users
- accounts
- broker_connections
- instruments
- market_snapshots
- ai_runs
- agent_runs
- tool_calls
- research_reports
- proposed_orders
- risk_gate_decisions
- approvals
- paper_orders
- live_orders
- order_events
- fills
- positions
- pnl_snapshots
- audit_events
- kill_switch_events
- compliance_flags

For each table provide:
- Purpose
- Key fields
- Relationships
- Retention period
- Indexes
- Example row

Audit records must include:
- request_id
- user_id
- account_id
- strategy_id
- ai_run_id
- proposed_order_payload
- normalized_order_payload
- gate_decision
- reason_codes
- approval_id
- broker_order_id
- execution_mode
- timestamp
- rule_engine_version
- model_version
- data-source version

======================================================================
12. API CONTRACT
======================================================================

Define REST endpoints for:
- Start AI research run
- Get run status
- Get research report
- Submit proposed order
- Get risk-gate decision
- Approve live order
- Reject live order
- Create paper order
- Cancel order
- Get portfolio
- Get positions
- Get order history
- Trigger kill switch
- Get audit trail

For each endpoint provide:
- HTTP method
- Path
- Request body
- Response body
- Authorization
- Rate limit
- Error codes
- Example JSON request/response

======================================================================
13. SECURITY AND COMPLIANCE CONTROLS
======================================================================

Include:
- OAuth 2.0 / OpenID Connect
- Role-based access control
- Least-privilege tool permissions
- Broker credential vault
- Secret rotation
- Encryption at rest and in transit
- Static IP / IP allowlisting where broker-required
- 2FA / step-up authentication for live approvals
- Immutable audit logs
- Data retention policy
- PII minimization
- Prompt-injection defenses
- Tool-output sanitization
- Restricted web-scraping policy
- Market-abuse surveillance
- Jurisdiction mapping for Crypto, NASDAQ, and NSE
- Broker-specific API rules
- SEBI/NSE algo-trading considerations
- EU MiCA considerations for crypto services
- Kill-switch procedures
- Incident-response workflow

======================================================================
14. OBSERVABILITY AND MONITORING
======================================================================

Define:
- Structured logs
- Distributed traces
- Metrics
- Alerts
- Dashboards

Track:
- AI run duration
- Token usage
- Cost per run
- Tool-call count
- Tool failure rate
- Schema-validation failure rate
- Risk-gate block rate
- Approval latency
- Order submission latency
- Broker rejection rate
- Fill rate
- Daily loss
- Portfolio exposure
- Strategy drawdown
- Kill-switch activations

======================================================================
15. TESTING PLAN
======================================================================

Create tests for:
- Valid order
- Invalid schema
- Missing field
- Negative quantity
- Invalid symbol
- Market closed
- Trading halt
- Restricted instrument
- Invalid lot size
- Price outside band
- Order notional too high
- Symbol concentration breach
- Market concentration breach
- Daily loss breach
- Daily turnover breach
- Leverage breach
- Duplicate order
- Paper order auto-execution
- Live order without approval
- Live order with approval
- Approval rejection
- Broker rejection
- Broker timeout
- AI tool-loop budget exhaustion
- Prompt injection attempting to bypass the risk gate
- Kill-switch activation
- Audit-log completeness

Use mocked model and broker responses.

======================================================================
16. REPOSITORY REUSE ANALYSIS
======================================================================

For each GitHub repository above, provide:
- Repository link
- What it does
- What pattern to reuse
- What to modify
- What not to reuse
- REQUIRED / OPTIONAL / NOT RECOMMENDED
- Reason

======================================================================
17. COMPONENTS NOT NEEDED IN VERSION 1
======================================================================

Explicitly exclude:
- Fully autonomous live trading
- Self-evolving trading strategies
- Unrestricted web scraping
- AI-managed broker credentials
- LLM-based final risk approval
- Complex multi-agent orchestration without clear value
- Direct social-media sentiment trading
- Automated derivatives or leveraged products
- Fully automated portfolio rebalancing
- Autonomous crypto wallet transactions

Explain why each is excluded.

======================================================================
18. PHASED IMPLEMENTATION ROADMAP
======================================================================

Provide three phases:

Phase 1 — MVP:
- Harness core
- Read-only market research
- Paper trading
- Basic risk gate
- Audit logs
- Simple dashboard

Phase 2 — Beta:
- Live-order approval queue
- Full risk limits
- Compliance surveillance
- Broker integrations
- Alerts
- Post-trade monitoring

Phase 3 — Production:
- Multi-market scale
- Advanced surveillance
- Strategy governance
- Backtesting
- Reconciliation
- Regulatory reporting support
- High-availability deployment

For each phase provide:
- Duration estimate
- Team roles
- Deliverables
- Acceptance criteria
- Risks
- Dependencies

======================================================================
19. FINAL PASTE-READY CODING PROMPT
======================================================================

At the end, output a shorter implementation prompt for Cursor, Claude Code, or GPT.

It must specify:
- TypeScript
- Node.js
- Ajv
- PostgreSQL
- Docker
- REST API
- Structured logging
- Optional OpenTelemetry
- Paper-trading-first approach
- Human approval for live orders
- Rule-engine-first architecture
- Test-first development
- Recommended folder structure
- First 10 implementation tasks
- Definition of done

======================================================================
FINAL CONSTRAINTS
======================================================================

- Do not produce generic advice.
- Do not omit the Risk & Compliance Gate.
- Do not allow the AI to bypass controls.
- Do not recommend autonomous live trading.
- Do not use AI confidence as a risk limit.
- Do not expose broker credentials to the model.
- Do not create an uncontrolled agent swarm.
- Output complete, implementable architecture, schemas, and code.
- Prefer simple, explicit, testable components over complex agent frameworks.
