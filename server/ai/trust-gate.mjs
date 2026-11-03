import { createHash } from 'node:crypto';

/**
 * Trust-Gated Multi-Agent Architecture
 * Reference pattern: advanced_ai_agents/multi_agent_apps/trust_gated_agent_team
 *
 * Implements:
 * 1. Multi-factor Trust Scoring (0-100 scale)
 * 2. Tier Management: GOLD (>=85), SILVER (70-84), BRONZE (<70)
 * 3. Deterministic Trust Gate Decisions: TRUST_APPROVED, TRUST_FLAGGED, TRUST_BLOCKED
 * 4. Cryptographic SHA-256 Hash-Chained Audit Trail across agent handoffs
 * 5. Tamper-evident verification of the chain
 */

const sha256 = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

export function createAuditBlock(index, previousHash, agent, eventType, payload) {
  const timestamp = new Date().toISOString();
  const payloadHash = sha256(payload);
  const blockData = { index, previousHash, agent, eventType, timestamp, payloadHash };
  const blockHash = sha256(blockData);
  return {
    ...blockData,
    blockHash,
    summary: typeof payload === 'object' && payload !== null && payload.summary ? payload.summary : `${eventType} by ${agent}`
  };
}

export function buildTrustChain({ runId, market, symbol, evidence, toolEvidence, researchRun, reviewRun, gateDecision, trustScore }) {
  const blocks = [];

  // Block 0: Genesis block
  const block0 = createAuditBlock(0, '0'.repeat(64), 'System Protocol', 'GENESIS', {
    runId,
    market,
    symbol,
    pattern: 'advanced_ai_agents/multi_agent_apps/trust_gated_agent_team',
    policyVersion: '1.2.0-trust-gated',
    summary: `Genesis initialized for ${market}/${symbol} session ${runId.slice(0, 8)}`
  });
  blocks.push(block0);

  // Block 1: Market Research Analyst evidence block
  const block1 = createAuditBlock(1, block0.blockHash, 'Market Research Analyst', 'EVIDENCE_COLLECTED', {
    source: evidence.source,
    candleCount: evidence.candles?.length || 0,
    lastDate: evidence.lastDate,
    tools: (toolEvidence || []).map(t => t.tool),
    close: evidence.candles?.at(-1)?.close ?? null,
    summary: `Verified ${evidence.candles?.length || 0} bars from ${evidence.source}`
  });
  blocks.push(block1);

  // Block 2: Independent Risk Reviewer block
  const block2 = createAuditBlock(2, block1.blockHash, 'Independent Risk Reviewer', 'RISK_EVALUATION', {
    status: reviewRun?.status || 'skipped',
    steps: reviewRun?.steps || 0,
    answerSummary: reviewRun?.answer ? reviewRun.answer.slice(0, 100) : 'No answer',
    summary: `Independent risk evaluation status: ${reviewRun?.status || 'incomplete'}`
  });
  blocks.push(block2);

  // Block 3: Trust Gate & Compliance Synthesizer decision block
  const block3 = createAuditBlock(3, block2.blockHash, 'Trust Gate & Compliance Synthesizer', 'TRUST_GATE_DECISION', {
    trustScore,
    gateDecision,
    readOnlyEnforced: true,
    summary: `Gate Decision: ${gateDecision} (Score ${trustScore}/100)`
  });
  blocks.push(block3);

  return blocks;
}

export function verifyTrustChain(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { verified: false, error: 'Empty chain', blocksCount: 0 };
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (i === 0) {
      if (block.previousHash !== '0'.repeat(64)) {
        return { verified: false, error: 'Corrupt genesis block', tamperedBlock: 0 };
      }
    } else {
      const prevBlock = blocks[i - 1];
      if (block.previousHash !== prevBlock.blockHash) {
        return { verified: false, error: `Hash link broken between block ${i - 1} and ${i}`, tamperedBlock: i };
      }
    }

    // Recompute block hash to verify tamper-evidence
    const expectedData = {
      index: block.index,
      previousHash: block.previousHash,
      agent: block.agent,
      eventType: block.eventType,
      timestamp: block.timestamp,
      payloadHash: block.payloadHash
    };
    const expectedHash = sha256(expectedData);
    if (expectedHash !== block.blockHash) {
      return { verified: false, error: `Tampered hash at block ${i}`, tamperedBlock: i };
    }
  }

  return {
    verified: true,
    blocksCount: blocks.length,
    genesisHash: blocks[0].blockHash,
    latestHash: blocks.at(-1).blockHash
  };
}

export function evaluateTrustMetrics({ evidence, toolEvidence, researchStatus, reviewStatus }) {
  const checks = [];
  let score = 0;

  // 1. Evidence Grounding & Required Tools Coverage (Max 35 pts)
  const requiredTools = ['read_market_evidence', 'backtest_sma_rule', 'check_hypothetical_risk', 'execution_capabilities'];
  const executedTools = new Set((toolEvidence || []).map(t => t.tool));
  const missingTools = requiredTools.filter(t => !executedTools.has(t));

  if (missingTools.length === 0 && researchStatus === 'completed') {
    score += 35;
    checks.push({
      name: 'Evidence Grounding',
      status: 'PASSED',
      score: 35,
      maxScore: 35,
      detail: 'All 4 required research tools executed with verified parameters'
    });
  } else {
    const partial = Math.max(0, 35 - missingTools.length * 15);
    score += partial;
    checks.push({
      name: 'Evidence Grounding',
      status: missingTools.length === 0 ? 'WARNING' : 'FAILED',
      score: partial,
      maxScore: 35,
      detail: missingTools.length > 0 ? `Missing required tools: ${missingTools.join(', ')}` : 'Research did not complete'
    });
  }

  // 2. Data Provenance & Freshness (Max 25 pts)
  const isSourceVerified = evidence?.source && /Kraken|Binance|Stooq|Yahoo Finance/.test(evidence.source);
  const candleCount = evidence?.candles?.length || 0;
  if (isSourceVerified && candleCount >= 55) {
    score += 25;
    checks.push({
      name: 'Data Provenance & Freshness',
      status: 'PASSED',
      score: 25,
      maxScore: 25,
      detail: `Verified market provider (${evidence.source}) with ${candleCount} historical daily bars`
    });
  } else {
    checks.push({
      name: 'Data Provenance & Freshness',
      status: 'FAILED',
      score: 0,
      maxScore: 25,
      detail: 'Unverified source or insufficient candle history'
    });
  }

  // 3. Hypothetical Risk Limits Conformance (Max 20 pts)
  const riskTool = (toolEvidence || []).find(t => t.tool === 'check_hypothetical_risk');
  const riskPassed = riskTool && riskTool.result?.status === 'WITHIN_ILLUSTRATIVE_LIMITS';
  if (riskPassed) {
    score += 20;
    checks.push({
      name: 'Risk Boundary Compliance',
      status: 'PASSED',
      score: 20,
      maxScore: 20,
      detail: 'Proposed hypothetical allocation and stop-loss within illustrative bounds'
    });
  } else if (riskTool) {
    checks.push({
      name: 'Risk Boundary Compliance',
      status: 'WARNING',
      score: 0,
      maxScore: 20,
      detail: 'Risk tool returned BLOCKED_BY_ILLUSTRATIVE_LIMITS'
    });
  } else {
    checks.push({
      name: 'Risk Boundary Compliance',
      status: 'FAILED',
      score: 0,
      maxScore: 20,
      detail: 'Risk boundary check tool was not invoked'
    });
  }

  // 4. Execution Sandbox Quarantine & Read-Only Policy (Max 20 pts)
  const execTool = (toolEvidence || []).find(t => t.tool === 'execution_capabilities');
  const isQuarantined = execTool && execTool.result?.readOnly === true &&
    execTool.result?.liveOrderPlacement === false && execTool.result?.paperOrderPlacement === false;
  if (isQuarantined) {
    score += 20;
    checks.push({
      name: 'Execution Sandbox Quarantine',
      status: 'PASSED',
      score: 20,
      maxScore: 20,
      detail: 'Strict read-only sandbox quarantine confirmed; live & paper orders disabled'
    });
  } else {
    checks.push({
      name: 'Execution Sandbox Quarantine',
      status: 'FAILED',
      score: 0,
      maxScore: 20,
      detail: 'Execution capability quarantine could not be verified'
    });
  }

  // Determine Tier: Gold (>=85), Silver (70-84), Bronze (<70)
  const trustScore = Math.min(100, Math.max(0, score));
  let trustTier = 'BRONZE';
  if (trustScore >= 85) {
    trustTier = 'GOLD';
  } else if (trustScore >= 70) {
    trustTier = 'SILVER';
  }

  // Determine Gate Decision: TRUST_APPROVED (>=70 and all required pass), TRUST_FLAGGED (50-69 or warning), TRUST_BLOCKED (<50 or missing required)
  let gateDecision = 'TRUST_BLOCKED';
  const hasFatalFailure = missingTools.length > 0 || !isQuarantined ||
    researchStatus !== 'completed' || reviewStatus !== 'completed';

  if (!hasFatalFailure && trustScore >= 70 && riskPassed) {
    gateDecision = 'TRUST_APPROVED';
  } else if (researchStatus === 'completed' && reviewStatus === 'completed' &&
    trustScore >= 50 && !missingTools.includes('read_market_evidence') && isQuarantined) {
    gateDecision = 'TRUST_FLAGGED';
  } else {
    gateDecision = 'TRUST_BLOCKED';
  }

  return {
    trustScore,
    trustTier,
    gateDecision,
    threshold: 70,
    evidenceGroundingPct: Math.round(((requiredTools.length - missingTools.length) / requiredTools.length) * 100),
    checks
  };
}
