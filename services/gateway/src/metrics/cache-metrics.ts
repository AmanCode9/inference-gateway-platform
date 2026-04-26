export interface CacheMetricsSnapshot {
  readonly exactHitCount: number;
  readonly missCount: number;
  readonly bypassCount: number;
  readonly readErrorCount: number;
  readonly writeErrorCount: number;
}

export interface CacheMetrics {
  readonly recordExactHit: () => void;
  readonly recordMiss: () => void;
  readonly recordBypass: () => void;
  readonly recordReadError: () => void;
  readonly recordWriteError: () => void;
  readonly snapshot: () => CacheMetricsSnapshot;
}

export function createCacheMetrics(): CacheMetrics {
  let exactHitCount = 0;
  let missCount = 0;
  let bypassCount = 0;
  let readErrorCount = 0;
  let writeErrorCount = 0;

  return {
    recordExactHit: () => {
      exactHitCount += 1;
    },
    recordMiss: () => {
      missCount += 1;
    },
    recordBypass: () => {
      bypassCount += 1;
    },
    recordReadError: () => {
      readErrorCount += 1;
    },
    recordWriteError: () => {
      writeErrorCount += 1;
    },
    snapshot: () => ({
      exactHitCount,
      missCount,
      bypassCount,
      readErrorCount,
      writeErrorCount
    })
  };
}
