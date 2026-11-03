import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiRunMetrics, createSessionAiRunMetrics } from '../server/ai/run-metrics.mjs';

const SIX_HOURS = 6 * 60 * 60 * 1000;

test('aggregates success rate and latency by six-hour bucket without storing run content', () => {
  const now = Date.parse('2026-11-03T07:30:00Z');
  const metrics = createAiRunMetrics({ now: () => now });
  metrics.record({ timestamp: Date.parse('2026-11-03T06:10:00Z'), latencyMs: 1200, success: true, prompt: 'private' });
  metrics.record({ timestamp: Date.parse('2026-11-03T07:00:00Z'), latencyMs: 2801, success: false, result: 'private' });
  metrics.record({ timestamp: Date.parse('2026-11-03T01:00:00Z'), latencyMs: 500, success: true });

  const snapshot = metrics.snapshot();
  const current = snapshot.buckets.at(-1);
  const previous = snapshot.buckets.at(-2);
  assert.equal(snapshot.totalRuns, 3);
  assert.equal(snapshot.windowDays, 7);
  assert.equal(snapshot.bucketHours, 6);
  assert.deepEqual(
    { runs: current.runCount, succeeded: current.successCount, rate: current.successRate, latency: current.averageLatencyMs },
    { runs: 2, succeeded: 1, rate: 50, latency: 2001 }
  );
  assert.equal(previous.averageLatencyMs, 500);
  assert.equal(previous.successRate, 100);
  assert.equal(JSON.stringify(snapshot).includes('private'), false);
  assert.equal(snapshot.buckets.length, 28);
});

test('bounds history by age and capacity and rejects invalid metric values', () => {
  let now = Date.parse('2026-11-03T07:30:00Z');
  const metrics = createAiRunMetrics({ now: () => now, capacity: 2, retentionMs: 24 * 60 * 60 * 1000 });
  metrics.record({ timestamp: now - 25 * 60 * 60 * 1000, latencyMs: 100, success: true });
  metrics.record({ timestamp: now - 60_000, latencyMs: 200, success: true });
  metrics.record({ timestamp: now, latencyMs: 300, success: false });
  metrics.record({ timestamp: now, latencyMs: -1, success: true });
  metrics.record({ timestamp: now, latencyMs: 300, success: 'yes' });
  assert.equal(metrics.snapshot().totalRuns, 2);

  now += 25 * 60 * 60 * 1000;
  assert.equal(metrics.snapshot().totalRuns, 0);
});

test('keeps only the newest runs when capacity is reached', () => {
  const now = Date.parse('2026-11-03T07:30:00Z');
  const metrics = createAiRunMetrics({ now: () => now, capacity: 2 });
  for (const [index, success] of [true, false, false].entries()) {
    metrics.record({ timestamp: now - (2 - index) * SIX_HOURS, latencyMs: index * 100, success });
  }
  assert.equal(metrics.snapshot().totalRuns, 2);
  assert.equal(metrics.snapshot().buckets.reduce((count, bucket) => count + bucket.successCount, 0), 0);
});


test('AI performance history is private to each authenticated session', () => {
  const now = Date.parse('2026-11-03T07:30:00Z');
  const metrics = createSessionAiRunMetrics({ now: () => now });
  metrics.record({ sessionId: 'alice-session', timestamp: now, latencyMs: 100, success: true, prompt: 'secret research' });
  metrics.record({ sessionId: 'bob-session', timestamp: now, latencyMs: 800, success: false });
  assert.equal(metrics.snapshot('alice-session').totalRuns, 1);
  assert.equal(metrics.snapshot('bob-session').totalRuns, 1);
  assert.equal(metrics.snapshot('other-session').totalRuns, 0);
  assert.equal(metrics.snapshot(undefined).totalRuns, 0);
  assert.equal(metrics.snapshot('alice-session').buckets.at(-1).successRate, 100);
  assert.equal(metrics.snapshot('bob-session').buckets.at(-1).successRate, 0);
  assert.equal(JSON.stringify(metrics.snapshot('alice-session')).includes('secret research'), false);
  assert.equal(JSON.stringify(metrics.snapshot('alice-session')).includes('alice-session'), false);
  assert.equal(JSON.stringify(metrics.snapshot('alice-session')).includes('bob-session'), false);
});

test('missing session cannot create records and bounded session storage evicts stale users', () => {
  let now = Date.parse('2026-11-03T07:30:00Z');
  const metrics = createSessionAiRunMetrics({ now: () => now, maxSessions: 2, retentionMs: 10000 });
  metrics.record({ timestamp: now, latencyMs: 5, success: true });
  metrics.record({ sessionId: '', timestamp: now, latencyMs: 5, success: true });
  assert.equal(metrics.snapshot('').totalRuns, 0);
  metrics.record({ sessionId: 'A', timestamp: now, latencyMs: 5, success: true });
  now += 1000;
  metrics.record({ sessionId: 'B', timestamp: now, latencyMs: 10, success: true });
  now += 1000;
  metrics.record({ sessionId: 'C', timestamp: now, latencyMs: 15, success: true });
  assert.equal(metrics.snapshot('A').totalRuns, 0);
  assert.equal(metrics.snapshot('B').totalRuns, 1);
  assert.equal(metrics.snapshot('C').totalRuns, 1);
  now += 12000;
  assert.equal(metrics.snapshot('B').totalRuns, 0);
  assert.equal(metrics.snapshot('C').totalRuns, 0);
  assert.throws(() => createSessionAiRunMetrics({maxSessions:0}), RangeError);
});
