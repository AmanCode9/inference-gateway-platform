export interface CacheMetricsSnapshot {
  readonly exactHitCount: number;
  readonly semanticHitCount: number;
  readonly semanticMissCount: number;
  readonly semanticBypassCount: number;
  readonly semanticRejectedCount: number;
  readonly semanticErrorCount: number;
  readonly missCount: number;
  readonly bypassCount: number;
  readonly readErrorCount: number;
  readonly writeErrorCount: number;
}

export interface CacheMetrics {
  readonly recordExactHit: () => void;
  readonly recordSemanticHit: () => void;
  readonly recordSemanticMiss: () => void;
  readonly recordSemanticBypass: () => void;
  readonly recordSemanticRejected: () => void;
  readonly recordSemanticError: () => void;
  readonly recordMiss: () => void;
  readonly recordBypass: () => void;
  readonly recordReadError: () => void;
  readonly recordWriteError: () => void;
  readonly snapshot: () => CacheMetricsSnapshot;
}

export function createCacheMetrics(): CacheMetrics {
  let exactHitCount = 0;
  let semanticHitCount = 0;
  let semanticMissCount = 0;
  let semanticBypassCount = 0;
  let semanticRejectedCount = 0;
  let semanticErrorCount = 0;
  let missCount = 0;
  let bypassCount = 0;
  let readErrorCount = 0;
  let writeErrorCount = 0;

  return {
    recordExactHit: () => {
      exactHitCount += 1;
    },
    recordSemanticHit: () => {
      semanticHitCount += 1;
    },
    recordSemanticMiss: () => {
      semanticMissCount += 1;
    },
    recordSemanticBypass: () => {
      semanticBypassCount += 1;
    },
    recordSemanticRejected: () => {
      semanticRejectedCount += 1;
    },
    recordSemanticError: () => {
      semanticErrorCount += 1;
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
      semanticHitCount,
      semanticMissCount,
      semanticBypassCount,
      semanticRejectedCount,
      semanticErrorCount,
      missCount,
      bypassCount,
      readErrorCount,
      writeErrorCount
    })
  };
}
