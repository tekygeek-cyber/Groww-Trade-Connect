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

const aiRunMetrics = createAiRunMetrics();

export const recordAiRunMetric = aiRunMetrics.record;
export const getAiRunMetrics = aiRunMetrics.snapshot;
