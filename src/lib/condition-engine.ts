/**
 * BEACON ROAD CONDITION INTELLIGENCE ENGINE
 * ==============================================================================
 * Core mathematical engine that aggregates repeated independent bus-pass
 * observations into deterministic, explainable segment-level road condition
 * intelligence.
 *
 * "Every participating bus becomes a moving road-condition sensor."
 * ==============================================================================
 */

export const HAZARD_WEIGHTS = {
  POTHOLE: 1.25,
  BROKEN_PATCH: 1.1,
  SPEED_BREAKER: 0.7,
  ROUGHNESS: 0.5,
} as const;

export type EventType = keyof typeof HAZARD_WEIGHTS;

export interface SegmentInputMetrics {
  segmentId: string;
  segmentLengthMeters: number;

  totalPasses: number;
  affectedPasses: number;
  uniqueBuses: number;
  totalFleetBuses: number;

  potholeCount: number;
  speedBreakerCount: number;
  brokenPatchCount: number;
  roughnessCount: number;

  totalEvents: number;

  meanSeverity: number;
  maxSeverity: number;

  meanEventConfidence: number;

  lastObservedAt?: string;
  suppressedCount?: number;
}

export interface SegmentConditionResult {
  segmentId: string;
  conditionScore: number;
  conditionClass: "GOOD" | "MODERATE" | "POOR";
  confidence: number;
  explanation: string;

  // Preserved lineage metrics
  segmentLengthMeters: number;
  totalPasses: number;
  affectedPasses: number;
  uniqueBuses: number;
  totalFleetBuses: number;
  totalEvents: number;
  potholeCount: number;
  speedBreakerCount: number;
  brokenPatchCount: number;
  roughnessCount: number;
  meanSeverity: number;
  maxSeverity: number;
  meanEventConfidence: number;
  suppressedCount: number;
  lastObservedAt?: string | undefined;
}

export interface NetworkConditionSummary {
  networkScore: number;
  goodCount: number;
  moderateCount: number;
  poorCount: number;
  totalCorridors: number;
  totalPasses: number;
  totalHazards: number;
  uniqueBuses: number;
}

/**
 * Calculate deterministic, penalty-based condition score and observation confidence.
 *
 * BASE_SCORE = 100.0
 * Penalties:
 * 1. Severity Penalty: (meanSeverity * 5.5) * (affectedPasses / totalPasses)
 * 2. Density Penalty: min(25.0, (weightedEventCount / segmentLengthMeters) * 40.0 / totalPasses)
 * 3. Persistence Penalty: (affectedPassRatio * 12.0) * (uniqueBuses / totalFleetBuses)
 */
export function calculateSegmentCondition(
  metrics: SegmentInputMetrics
): SegmentConditionResult {
  const {
    segmentId,
    segmentLengthMeters,
    totalPasses,
    affectedPasses,
    uniqueBuses,
    totalFleetBuses,
    potholeCount,
    speedBreakerCount,
    brokenPatchCount,
    roughnessCount,
    totalEvents,
    meanSeverity,
    maxSeverity,
    meanEventConfidence,
    lastObservedAt,
    suppressedCount = 0,
  } = metrics;

  const validLength = Math.max(segmentLengthMeters, 1.0);
  const safeTotalPasses = Math.max(totalPasses, 1);
  const safeTotalBuses = Math.max(totalFleetBuses, 1);

  const affectedPassRatio = Math.min(1.0, Math.max(0.0, affectedPasses / safeTotalPasses));
  const busCoverageRatio = Math.min(1.0, Math.max(0.0, uniqueBuses / safeTotalBuses));

  let conditionScore: number;
  let explanation: string;

  if (totalEvents === 0) {
    // Zero-event corridor: pristine road baseline
    conditionScore = 95.0;
    explanation = `Pristine corridor: 0 road hazards detected across ${totalPasses} passes (${uniqueBuses} unique buses).`;
  } else {
    // Weighted hazard count
    const weightedEventCount =
      potholeCount * HAZARD_WEIGHTS.POTHOLE +
      brokenPatchCount * HAZARD_WEIGHTS.BROKEN_PATCH +
      speedBreakerCount * HAZARD_WEIGHTS.SPEED_BREAKER +
      roughnessCount * HAZARD_WEIGHTS.ROUGHNESS;

    // 1. Severity penalty proportional to confirmed affected passes
    const severityPenalty = meanSeverity * 5.5 * affectedPassRatio;

    // 2. Spatial density penalty normalized per 100m of corridor length and pass count
    // Note: segmentLengthMeters is in meters (avg ~120m). Normalizing by (validLength / 100)
    // converts raw events to events/100m, ensuring standard civil engineering hazard density scaling.
    const densityPer100m = weightedEventCount / (validLength / 100.0);
    const densityPenalty = Math.min(
      25.0,
      densityPer100m * (40.0 / safeTotalPasses)
    );

    // 3. Multi-bus persistence penalty: confirmed across multiple distinct buses
    const persistencePenalty = affectedPassRatio * 12.0 * busCoverageRatio;

    const rawScore = 100.0 - severityPenalty - densityPenalty - persistencePenalty;
    conditionScore = Math.max(0.0, Math.min(100.0, rawScore));

    explanation = `${affectedPasses} of ${totalPasses} passes reported accepted hazards across ${uniqueBuses} buses; ${potholeCount} potholes, ${speedBreakerCount} speed breakers, ${brokenPatchCount} broken patches, and ${roughnessCount} roughness events contributed to the condition estimate.`;
  }

  // Observation Confidence: saturation function based on passes, bus coverage, and detector confidence
  const passSaturation = 1.0 - Math.exp(-safeTotalPasses / 14.0);
  const busCoverage = 0.5 + 0.5 * (uniqueBuses / safeTotalBuses);
  const detectorConfidence = totalEvents === 0 ? 1.0 : Math.max(0.5, meanEventConfidence || 0.9);

  const rawConfidence = passSaturation * busCoverage * detectorConfidence * 100.0;
  const confidence = Math.min(99.5, Math.max(5.0, rawConfidence));

  // Prototype Condition Classes:
  // GOOD: >= 80.0
  // MODERATE: 50.0 to 79.9
  // POOR: < 50.0
  const roundedScore = Math.round(conditionScore * 10) / 10;
  let conditionClass: "GOOD" | "MODERATE" | "POOR";
  if (roundedScore >= 80.0) {
    conditionClass = "GOOD";
  } else if (roundedScore >= 50.0) {
    conditionClass = "MODERATE";
  } else {
    conditionClass = "POOR";
  }

  return {
    segmentId,
    conditionScore: roundedScore,
    conditionClass,
    confidence: Math.round(confidence * 10) / 10,
    explanation,
    segmentLengthMeters,
    totalPasses,
    affectedPasses,
    uniqueBuses,
    totalFleetBuses,
    totalEvents,
    potholeCount,
    speedBreakerCount,
    brokenPatchCount,
    roughnessCount,
    meanSeverity: Math.round(meanSeverity * 100) / 100,
    maxSeverity,
    meanEventConfidence: Math.round((meanEventConfidence || 0) * 100) / 100,
    suppressedCount,
    lastObservedAt,
  };
}

/**
 * Calculate length-weighted network-level road condition score and summary metrics.
 * Length-weighting ensures a 50m minor segment does not unduly equal a 200m major corridor.
 */
export function calculateNetworkCondition(
  segments: Array<{
    conditionScore: number;
    segmentLengthMeters?: number;
    conditionClass: string;
    totalPasses?: number;
    totalEvents?: number;
    uniqueBuses?: number;
  }>
): NetworkConditionSummary {
  if (segments.length === 0) {
    return {
      networkScore: 0,
      goodCount: 0,
      moderateCount: 0,
      poorCount: 0,
      totalCorridors: 0,
      totalPasses: 0,
      totalHazards: 0,
      uniqueBuses: 0,
    };
  }

  let totalWeightedScore = 0;
  let totalLength = 0;
  let goodCount = 0;
  let moderateCount = 0;
  let poorCount = 0;
  let totalHazards = 0;
  let maxPasses = 0;
  let maxBuses = 0;

  for (const seg of segments) {
    const len = seg.segmentLengthMeters && seg.segmentLengthMeters > 0 ? seg.segmentLengthMeters : 100;
    totalWeightedScore += seg.conditionScore * len;
    totalLength += len;

    if (seg.conditionClass === "GOOD") goodCount++;
    else if (seg.conditionClass === "MODERATE") moderateCount++;
    else if (seg.conditionClass === "POOR") poorCount++;

    if (seg.totalEvents) totalHazards += seg.totalEvents;
    if (seg.totalPasses && seg.totalPasses > maxPasses) maxPasses = seg.totalPasses;
    if (seg.uniqueBuses && seg.uniqueBuses > maxBuses) maxBuses = seg.uniqueBuses;
  }

  const networkScore =
    totalLength > 0
      ? Math.round((totalWeightedScore / totalLength) * 10) / 10
      : Math.round((segments.reduce((a, s) => a + s.conditionScore, 0) / segments.length) * 10) / 10;

  return {
    networkScore,
    goodCount,
    moderateCount,
    poorCount,
    totalCorridors: segments.length,
    totalPasses: maxPasses || 60,
    totalHazards,
    uniqueBuses: maxBuses || 10,
  };
}
