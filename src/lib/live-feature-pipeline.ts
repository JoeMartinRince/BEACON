/**
 * Beacon Live Feature Pipeline & 5-Second Window Engine
 *
 * Implements:
 * 1. Rolling 5-second / 50-sample sensor window buffering at ~10Hz.
 * 2. Feature readiness diagnostic reporting (features available, missing, sample count, duration).
 * 3. Exact 34-feature extraction matching the offline ML model (beacon-event-rf-v1 / feature_extraction.py).
 * 4. Strict provenance: does not fabricate missing samples.
 */

export const FEATURE_NAMES_34: string[] = [
  // Accelerometer (19 features)
  "ax_mean",
  "ay_mean",
  "az_mean",
  "ax_std",
  "ay_std",
  "az_std",
  "ax_min",
  "ay_min",
  "az_min",
  "ax_max",
  "ay_max",
  "az_max",
  "accel_magnitude_mean",
  "accel_magnitude_std",
  "accel_magnitude_max",
  "jerk_mean",
  "jerk_std",
  "jerk_max",
  "vertical_acceleration_peak",
  // Gyroscope (8 features)
  "gx_mean",
  "gy_mean",
  "gz_mean",
  "gx_std",
  "gy_std",
  "gz_std",
  "gyro_magnitude_mean",
  "gyro_magnitude_std",
  // Vehicle Speed (5 features)
  "speed_mean",
  "speed_std",
  "speed_min",
  "speed_max",
  "speed_change",
  // Temporal (2 features)
  "window_duration",
  "sample_count",
];

export const GRAVITY_MS2 = 9.80665;
export const WINDOW_DURATION_SECONDS = 5.0;
export const MIN_SAMPLES_FOR_ML = 25; // Minimum viable samples (target 50 at 10Hz)

export interface SynchronizedSensorSample {
  timestamp: number;
  accel_x: number;
  accel_y: number;
  accel_z: number;
  gyro_x: number;
  gyro_y: number;
  gyro_z: number;
  speed_kmh: number;
  hasMotion: boolean;
  hasGpsSpeed: boolean;
}

export interface FeatureReadinessReport {
  readyForMl: boolean;
  sampleCount: number;
  windowDurationSeconds: number;
  featuresAvailable: string[];
  featuresMissing: string[];
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Math & Statistics Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i]!;
  return sum / arr.length;
}

function std(arr: number[], m?: number): number {
  if (arr.length <= 1) return 0;
  const avg = m ?? mean(arr);
  let sumSq = 0;
  for (let i = 0; i < arr.length; i++) {
    const diff = arr[i]! - avg;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / arr.length);
}

function min(arr: number[]): number {
  if (arr.length === 0) return 0;
  let m = arr[0]!;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i]! < m) m = arr[i]!;
  }
  return m;
}

function max(arr: number[]): number {
  if (arr.length === 0) return 0;
  let m = arr[0]!;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i]! > m) m = arr[i]!;
  }
  return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5-Second Rolling Window Buffer
// ─────────────────────────────────────────────────────────────────────────────

export class RollingSensorWindow {
  private samples: SynchronizedSensorSample[] = [];
  private windowDurationMs: number;

  constructor(windowDurationSeconds: number = WINDOW_DURATION_SECONDS) {
    this.windowDurationMs = windowDurationSeconds * 1000;
  }

  /**
   * Append a new sensor sample and prune samples older than window duration.
   */
  addSample(sample: SynchronizedSensorSample): void {
    this.samples.push(sample);
    const cutoff = sample.timestamp - this.windowDurationMs;
    // Prune expired samples
    while (this.samples.length > 0 && this.samples[0]!.timestamp < cutoff) {
      this.samples.shift();
    }
  }

  getSamples(): SynchronizedSensorSample[] {
    return [...this.samples];
  }

  getSampleCount(): number {
    return this.samples.length;
  }

  getWindowDurationSeconds(): number {
    if (this.samples.length < 2) return 0;
    const oldest = this.samples[0]!.timestamp;
    const newest = this.samples[this.samples.length - 1]!.timestamp;
    return Math.max(0, Number(((newest - oldest) / 1000).toFixed(2)));
  }

  reset(): void {
    this.samples = [];
  }

  /**
   * Evaluate whether current window has sufficient real sensor telemetry
   * to compute the 34 features required for ML inference.
   */
  evaluateReadiness(): FeatureReadinessReport {
    const count = this.samples.length;
    const duration = this.getWindowDurationSeconds();

    const available: string[] = [];
    const missing: string[] = [];

    // Check sample count and duration
    const hasEnoughSamples = count >= MIN_SAMPLES_FOR_ML;
    const hasSufficientDuration = duration >= 2.0;

    // Check motion completeness
    let motionSampleCount = 0;
    let gpsSpeedSampleCount = 0;
    for (const s of this.samples) {
      if (s.hasMotion) motionSampleCount++;
      if (s.hasGpsSpeed) gpsSpeedSampleCount++;
    }

    const hasMotionData = motionSampleCount >= MIN_SAMPLES_FOR_ML;
    const hasSpeedData = gpsSpeedSampleCount > 0;

    // Group available/missing features
    if (hasMotionData) {
      available.push(
        "ax_mean", "ay_mean", "az_mean", "ax_std", "ay_std", "az_std",
        "ax_min", "ay_min", "az_min", "ax_max", "ay_max", "az_max",
        "accel_magnitude_mean", "accel_magnitude_std", "accel_magnitude_max",
        "jerk_mean", "jerk_std", "jerk_max", "vertical_acceleration_peak",
        "gx_mean", "gy_mean", "gz_mean", "gx_std", "gy_std", "gz_std",
        "gyro_magnitude_mean", "gyro_magnitude_std",
      );
    } else {
      missing.push(
        "accelerometer_features (19)",
        "gyroscope_features (8)",
      );
    }

    if (hasSpeedData) {
      available.push("speed_mean", "speed_std", "speed_min", "speed_max", "speed_change");
    } else {
      missing.push("vehicle_speed_features (5)");
    }

    if (hasSufficientDuration) {
      available.push("window_duration", "sample_count");
    } else {
      missing.push("temporal_features (2)");
    }

    const readyForMl = hasEnoughSamples && hasSufficientDuration && hasMotionData;

    let reason = "Ready for ML inference";
    if (!hasMotionData) {
      reason = `Insufficient motion sensor samples (${motionSampleCount}/${MIN_SAMPLES_FOR_ML})`;
    } else if (!hasSufficientDuration) {
      reason = `Window duration too short (${duration}s < 2.0s)`;
    } else if (!hasEnoughSamples) {
      reason = `Insufficient total samples (${count}/${MIN_SAMPLES_FOR_ML})`;
    }

    return {
      readyForMl,
      sampleCount: count,
      windowDurationSeconds: duration,
      featuresAvailable: available,
      featuresMissing: missing,
      reason,
    };
  }

  /**
   * Extract all 34 features from current window.
   * Matches ml/feature_extraction.py extract_features_from_arrays() exactly.
   */
  extractFeatures(): Record<string, number> {
    const report = this.evaluateReadiness();
    if (this.samples.length === 0) {
      const empty: Record<string, number> = {};
      for (const name of FEATURE_NAMES_34) empty[name] = 0.0;
      return empty;
    }

    const ax = this.samples.map((s) => s.accel_x);
    const ay = this.samples.map((s) => s.accel_y);
    const az = this.samples.map((s) => s.accel_z);
    const gx = this.samples.map((s) => s.gyro_x);
    const gy = this.samples.map((s) => s.gyro_y);
    const gz = this.samples.map((s) => s.gyro_z);
    const spd = this.samples.map((s) => s.speed_kmh);

    // Accel magnitude
    const accelMag: number[] = [];
    for (let i = 0; i < ax.length; i++) {
      const x = ax[i]!;
      const y = ay[i]!;
      const z = az[i]!;
      accelMag.push(Math.sqrt(x * x + y * y + z * z));
    }

    // Jerk = d(az) / dt
    const jerk: number[] = [];
    for (let i = 1; i < az.length; i++) {
      const dt = Math.max(0.01, (this.samples[i]!.timestamp - this.samples[i - 1]!.timestamp) / 1000);
      jerk.push((az[i]! - az[i - 1]!) / dt);
    }
    if (jerk.length === 0) jerk.push(0);

    // Vertical acceleration peak |az - 9.80665|
    const vertDev: number[] = az.map((z) => Math.abs(z - GRAVITY_MS2));
    const vertPeak = max(vertDev);

    // Gyro magnitude
    const gyroMag: number[] = [];
    for (let i = 0; i < gx.length; i++) {
      const x = gx[i]!;
      const y = gy[i]!;
      const z = gz[i]!;
      gyroMag.push(Math.sqrt(x * x + y * y + z * z));
    }

    const features: Record<string, number> = {
      // Accelerometer (19)
      ax_mean: mean(ax),
      ay_mean: mean(ay),
      az_mean: mean(az),
      ax_std: std(ax),
      ay_std: std(ay),
      az_std: std(az),
      ax_min: min(ax),
      ay_min: min(ay),
      az_min: min(az),
      ax_max: max(ax),
      ay_max: max(ay),
      az_max: max(az),
      accel_magnitude_mean: mean(accelMag),
      accel_magnitude_std: std(accelMag),
      accel_magnitude_max: max(accelMag),
      jerk_mean: mean(jerk),
      jerk_std: std(jerk),
      jerk_max: max(jerk),
      vertical_acceleration_peak: vertPeak,

      // Gyroscope (8)
      gx_mean: mean(gx),
      gy_mean: mean(gy),
      gz_mean: mean(gz),
      gx_std: std(gx),
      gy_std: std(gy),
      gz_std: std(gz),
      gyro_magnitude_mean: mean(gyroMag),
      gyro_magnitude_std: std(gyroMag),

      // Speed (5)
      speed_mean: mean(spd),
      speed_std: std(spd),
      speed_min: min(spd),
      speed_max: max(spd),
      speed_change: spd.length > 1 ? spd[spd.length - 1]! - spd[0]! : 0.0,

      // Temporal (2)
      window_duration: report.windowDurationSeconds,
      sample_count: this.samples.length,
    };

    return features;
  }
}
