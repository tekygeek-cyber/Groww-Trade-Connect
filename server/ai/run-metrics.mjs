const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const BUCKET_MS = 6 * 60 * 60 * 1000;
const MAX_RUNS = 250;

export function createAiRunMetrics({ now = Date.now, capacity = MAX_RUNS, retentionMs = WINDOW_MS } = {}) {
  const runs = [];

  function record({ timestamp = now(), latencyMs, success }) {
    if (!Number.isFinite(timestamp) || !Number.isFinite(latencyMs) || latencyMs < 0 ||
        typeof success !== 'boolean') return;

    const currentTime = now();
    for (let index = runs.length - 1; index >= 0; index--) {
      if (runs[index].timestamp < currentTime - retentionMs) runs.splice(index, 1);
    }
    runs.push({ timestamp, latencyMs: Math.round(latencyMs), success });
    if (runs.length > capacity) runs.splice(0, runs.length - capacity);
  }

  function snapshot() {
    const currentTime = now();
    const end = Math.floor(currentTime / BUCKET_MS) * BUCKET_MS;
    const first = end - 27 * BUCKET_MS;
    for (let index = runs.length - 1; index >= 0; index--) {
      if (runs[index].timestamp < currentTime - retentionMs) runs.splice(index, 1);
    }

    const buckets = Array.from({ length: 28 }, (_, index) => ({
      bucketStart: new Date(first + index * BUCKET_MS).toISOString(),
      runCount: 0,
      successCount: 0,
      latencyTotalMs: 0,
    }));

    for (const run of runs) {
      const index = Math.floor((run.timestamp - first) / BUCKET_MS);
      if (index < 0 || index >= buckets.length) continue;
      const bucket = buckets[index];
      bucket.runCount++;
      bucket.successCount += Number(run.success);
      bucket.latencyTotalMs += run.latencyMs;
    }

    const populated = buckets.map(({ bucketStart, runCount, successCount, latencyTotalMs }) => ({
      bucketStart,
      runCount,
      successCount,
      successRate: runCount ? Math.round((successCount / runCount) * 1000) / 10 : null,
      averageLatencyMs: runCount ? Math.round(latencyTotalMs / runCount) : null,
    }));

    return {
      windowDays: 7,
      bucketHours: 6,
      totalRuns: populated.reduce((total, bucket) => total + bucket.runCount, 0),
      buckets: populated,
    };
  }

  return { record, snapshot };
}

/**
 * Metrics belong to the authenticated desk session that generated them.
 * We intentionally retain only bounded, anonymous timing/success aggregates.
 * Never return another caller's measurements or persist session IDs to disk.
 */
export function createSessionAiRunMetrics({
  now = Date.now,
  maxSessions = 150,
  retentionMs = WINDOW_MS,
  capacity = MAX_RUNS,
} = {}) {
  if (!Number.isSafeInteger(maxSessions) || maxSessions < 1) {
    throw new RangeError('Invalid maximum AI metric sessions');
  }
  const sessions = new Map();
  const empty = createAiRunMetrics({ now, retentionMs, capacity });

  const prune = () => {
    const cutoff = now() - retentionMs;
    for (const [id, entry] of sessions) {
      if (entry.lastSeen < cutoff) sessions.delete(id);
    }
  };

  function record({ sessionId, ...run }) {
    if (typeof sessionId !== 'string' || !sessionId.trim()) return;
    prune();
    let entry = sessions.get(sessionId);
    if (!entry) {
      // Least-recently-used eviction limits the server's memory footprint.
      if (sessions.size >= maxSessions) {
        const oldest = [...sessions.entries()].reduce((candidate, item) =>
          !candidate || item[1].lastSeen < candidate[1].lastSeen ? item : candidate, null);
        if (oldest) sessions.delete(oldest[0]);
      }
      entry = { metrics: createAiRunMetrics({ now, retentionMs, capacity }), lastSeen: now() };
      sessions.set(sessionId, entry);
    }
    entry.metrics.record(run);
    entry.lastSeen = now();
  }

  function snapshot(sessionId) {
    if (typeof sessionId !== 'string' || !sessionId.trim()) return empty.snapshot();
    prune();
    const entry = sessions.get(sessionId);
    return entry ? entry.metrics.snapshot() : empty.snapshot();
  }

  return { record, snapshot };
}

const sessionAiRunMetrics = createSessionAiRunMetrics();

export const recordAiRunMetric = sessionAiRunMetrics.record;
export const getAiRunMetrics = sessionAiRunMetrics.snapshot;
