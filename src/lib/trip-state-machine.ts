/**
 * Beacon Trip State Machine — Pure Deterministic Logic
 *
 * Extracted from trip-context.tsx to be fully headless and testable.
 * No React, no side effects. All state is passed in and returned.
 *
 * State flow:
 *   IDLE
 *     → speed >= MOVEMENT_START_SPEED_KMH  → MOVEMENT_DETECTED
 *
 *   MOVEMENT_DETECTED
 *     → speed drops below threshold        → IDLE  (GPS drift / momentary)
 *     → sustained for MOVEMENT_CONFIRM_SECONDS or displacement > 80m → TRIP_ACTIVE
 *
 *   TRIP_ACTIVE
 *     → speed < STOP_SPEED_KMH            → TEMPORARY_STOP
 *
 *   TEMPORARY_STOP
 *     → speed >= MOVEMENT_START_SPEED_KMH OR moved > STOP_RADIUS_METERS → TRIP_ACTIVE
 *     → stationary for TRIP_END_STATIONARY_SECONDS                       → TRIP_COMPLETED
 *
 *   TRIP_COMPLETED  (terminal — caller resets to IDLE after dismiss)
 */

import type { TripDetectionState, TripGPSPoint } from "./trip-types";
import { calculateDistanceKm } from "./trip-geocoder";

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds (exported for use in tests and UI)
// ─────────────────────────────────────────────────────────────────────────────

export const MOVEMENT_START_SPEED_KMH = 5.0;
export const STOP_SPEED_KMH = 2.0;
export const MOVEMENT_CONFIRM_SECONDS = 25;
export const TRIP_END_STATIONARY_SECONDS = 240; // 4 minutes
export const STOP_RADIUS_METERS = 30;
export const MAX_OFFLINE_BUFFER_SIZE = 500;
export const BATCH_FLUSH_INTERVAL_MS = 5000;

// ─────────────────────────────────────────────────────────────────────────────
// State machine input / output types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All mutable refs used by the state machine, carried by the caller.
 * The machine reads and writes these in-place (ref semantics preserved).
 */
export interface TripStateMachineRefs {
  movementStartTime: number | null;
  candidateStartPoint: TripGPSPoint | null;
  stopStartTime: number | null;
  stopStartPoint: TripGPSPoint | null;
}

export type TripStateTransition =
  | { nextState: "IDLE" }
  | { nextState: "MOVEMENT_DETECTED"; movementStartTime: number; candidateStartPoint: TripGPSPoint }
  | { nextState: "TRIP_ACTIVE"; confirmedStartPoint?: TripGPSPoint }
  | { nextState: "TEMPORARY_STOP"; stopStartTime: number; stopStartPoint: TripGPSPoint }
  | { nextState: "TRIP_COMPLETED" }
  | { nextState: "NO_CHANGE" };

// ─────────────────────────────────────────────────────────────────────────────
// Core transition function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given the current machine state and a new GPS point, compute the next state.
 *
 * @param currentState   - Current TripDetectionState
 * @param point          - New GPS point just received from the device
 * @param refs           - Mutable machine refs (read + updated by this function)
 * @param nowMs          - Timestamp to use for elapsed-time checks (defaults to Date.now())
 * @returns              - A TripStateTransition describing what should happen next
 */
export function transitionTripState(
  currentState: TripDetectionState,
  point: TripGPSPoint,
  refs: TripStateMachineRefs,
  nowMs: number = Date.now(),
): TripStateTransition {
  // ── 1. IDLE ──────────────────────────────────────────────────────────────
  if (currentState === "IDLE") {
    if (point.speed_kmh >= MOVEMENT_START_SPEED_KMH) {
      refs.movementStartTime = nowMs;
      refs.candidateStartPoint = point;
      return {
        nextState: "MOVEMENT_DETECTED",
        movementStartTime: nowMs,
        candidateStartPoint: point,
      };
    }
    return { nextState: "NO_CHANGE" };
  }

  // ── 2. MOVEMENT_DETECTED ─────────────────────────────────────────────────
  if (currentState === "MOVEMENT_DETECTED") {
    if (point.speed_kmh < MOVEMENT_START_SPEED_KMH) {
      // Speed dropped — assume GPS drift, reset
      refs.movementStartTime = null;
      refs.candidateStartPoint = null;
      return { nextState: "IDLE" };
    }

    const elapsedSec = (nowMs - (refs.movementStartTime ?? nowMs)) / 1000;
    const initialPoint = refs.candidateStartPoint ?? point;
    const displacementM =
      calculateDistanceKm(initialPoint.lat, initialPoint.lng, point.lat, point.lng) * 1000;

    if (elapsedSec >= MOVEMENT_CONFIRM_SECONDS || displacementM > 80) {
      // Trip confirmed
      refs.movementStartTime = null;
      refs.candidateStartPoint = null;
      return { nextState: "TRIP_ACTIVE", confirmedStartPoint: initialPoint };
    }

    return { nextState: "NO_CHANGE" };
  }

  // ── 3. TRIP_ACTIVE ────────────────────────────────────────────────────────
  if (currentState === "TRIP_ACTIVE") {
    if (point.speed_kmh < STOP_SPEED_KMH) {
      refs.stopStartTime = nowMs;
      refs.stopStartPoint = point;
      return { nextState: "TEMPORARY_STOP", stopStartTime: nowMs, stopStartPoint: point };
    }
    return { nextState: "NO_CHANGE" };
  }

  // ── 4. TEMPORARY_STOP ────────────────────────────────────────────────────
  if (currentState === "TEMPORARY_STOP") {
    const stopOrigin = refs.stopStartPoint ?? point;
    const distanceFromStopM =
      calculateDistanceKm(stopOrigin.lat, stopOrigin.lng, point.lat, point.lng) * 1000;
    const stopDurationSec = (nowMs - (refs.stopStartTime ?? nowMs)) / 1000;

    // Resumed movement: speed exceeded threshold or bus left the stop radius
    if (
      point.speed_kmh >= MOVEMENT_START_SPEED_KMH ||
      distanceFromStopM > STOP_RADIUS_METERS
    ) {
      refs.stopStartTime = null;
      refs.stopStartPoint = null;
      return { nextState: "TRIP_ACTIVE" };
    }

    // Prolonged stationary → trip ended
    if (stopDurationSec >= TRIP_END_STATIONARY_SECONDS) {
      refs.stopStartTime = null;
      refs.stopStartPoint = null;
      return { nextState: "TRIP_COMPLETED" };
    }

    return { nextState: "NO_CHANGE" };
  }

  // TRIP_COMPLETED is a terminal state — no automatic transitions from here
  return { nextState: "NO_CHANGE" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Live trip metrics calculation
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveTripMetrics {
  /** Total distance driven in this trip (km) */
  distance_km: number;
  /** Elapsed time since trip start (seconds) */
  duration_seconds: number;
  /** Maximum speed seen so far (km/h) */
  max_speed_kmh: number;
  /** Running average speed (km/h) */
  avg_speed_kmh: number;
  /** Number of GPS observations buffered */
  observation_count: number;
}

/**
 * Incrementally calculates trip metrics given an existing snapshot and a new point.
 * Pure function — no side effects.
 */
export function calculateTripMetrics(
  previous: LiveTripMetrics,
  lastPoint: TripGPSPoint | null,
  newPoint: TripGPSPoint,
  tripStartTimestamp: number,
  nowMs: number = Date.now(),
): LiveTripMetrics {
  const incrementalKm = lastPoint
    ? calculateDistanceKm(lastPoint.lat, lastPoint.lng, newPoint.lat, newPoint.lng)
    : 0;

  const distance_km = Number((previous.distance_km + incrementalKm).toFixed(3));
  const duration_seconds = Math.max(0, Math.floor((nowMs - tripStartTimestamp) / 1000));
  const max_speed_kmh = Math.max(previous.max_speed_kmh, newPoint.speed_kmh);
  const avg_speed_kmh =
    duration_seconds > 0
      ? Number(((distance_km / duration_seconds) * 3600).toFixed(1))
      : 0;

  return {
    distance_km,
    duration_seconds,
    max_speed_kmh,
    avg_speed_kmh,
    observation_count: previous.observation_count + 1,
  };
}

/** Returns an empty/zeroed LiveTripMetrics snapshot for the start of a trip. */
export function initialTripMetrics(): LiveTripMetrics {
  return {
    distance_km: 0,
    duration_seconds: 0,
    max_speed_kmh: 0,
    avg_speed_kmh: 0,
    observation_count: 0,
  };
}

/** Creates a fresh, zeroed TripStateMachineRefs object. */
export function createStateMachineRefs(): TripStateMachineRefs {
  return {
    movementStartTime: null,
    candidateStartPoint: null,
    stopStartTime: null,
    stopStartPoint: null,
  };
}
