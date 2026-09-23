# Beacon — KSRTC Road-Condition Sensing & Intelligence Platform

Beacon is a road-condition intelligence platform built around public bus networks (such as Kerala State Road Transport Corporation — KSRTC). By capturing movement signals and GPS traces from onboard mobile sensors during routine bus runs, Beacon crowdsources high-resolution road quality measurements, detects road hazards (potholes, speed breakers, broken patches, roughness), and presents aggregated corridor health to travellers and transport planners.

> [!NOTE]
> **Beacon Synthetic Road Network • Simulated KSRTC Bus Observations**
> The dataset included in this repository represents a simulated corridor network around the Kochi/Ernakulam region in Kerala, generated for architecture demonstration and algorithm benchmarking. It does not represent live operational measurements from KSRTC.

---

## The Two Sides of Beacon

Beacon is structured around two distinct operational domains:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        BEACON PLATFORM ARCHITECTURE                    │
└────────────────────────────────────────────────────────────────────────┘

 1. DATA COLLECTION SIDE (KSRTC Fleet Observations)
    ┌─────────────────────────┐
    │  KSRTC Buses & Drivers  │ ──► Onboard GPS + IMU Accelerometer/Gyro
    └─────────────────────────┘
                 │
                 ▼
    ┌─────────────────────────┐
    │     Bus Passes          │ ──► Raw Telemetry (sensor_data, 10Hz)
    │  (e.g. PASS_01_001_01)  │ ──► Detected Hazards (road_events)
    └─────────────────────────┘ ──► Suppressed Maneuvers (suppressed_events)
                 │
                 │ Multi-pass Aggregation & Scoring
                 ▼
 2. TRAVELLER SIDE (Corridor Health & Navigation Intelligence)
    ┌─────────────────────────┐
    │   Monitored Corridors   │ ──► road_segments (160 corridors)
    │  & Segment Conditions   │ ──► segment_conditions (pre-aggregated)
    └─────────────────────────┘
                 │
                 ▼
    ┌─────────────────────────┐
    │  Public Traveller View  │ ──► Corridor Health (Good / Moderate / Poor)
    │  (Map, Routes, Events)  │ ──► Pothole & Speed Breaker density per km
    └─────────────────────────┘
```

### 1. Data Collection Side (Observations)
- **Contributors**: Smartphone sensors on KSRTC buses or passengers travelling along normal routes.
- **Bus Passes**: Individual trips recording start/end time, route ID, distance, and traversed segments.
- **Sensor Telemetry**: High-cadence (10Hz) IMU acceleration ($a_x, a_y, a_z$) and gyroscope yaw/pitch/roll rates with GPS accuracy stamps.
- **Road Events**: Detected ground-truth road hazards (`POTHOLE`, `SPEED_BREAKER`, `BROKEN_PATCH`, `ROUGHNESS`) with peak timestamps, GPS coordinates, severity ratings, and confidence scores.
- **False-Positive Suppression**: Rejects normal vehicle dynamics such as sharp steering, harsh braking, or bus-stop pull-outs (`suppressed_events`).

### 2. Traveller Side (Corridor Intelligence)
- **Corridor Segments**: Standardized 100m–180m road segments with GeoJSON LineString geometries and start/end coordinates.
- **Segment Conditions**: Pre-aggregated metrics derived from repeated vehicle passes, providing mean/max severity, condition scores (0–100), condition classifications (`GOOD`, `MODERATE`, `POOR`), and hazard counts.
- **Traveller Queries**: Public, performant read access for route condition checks, interactive Leaflet maps, and segment degradation rankings.

---

## Database Architecture (PostgreSQL / Supabase)

The database schema is fully defined in [`supabase/schema.sql`](supabase/schema.sql) and [`supabase/migrations/20260923000000_beacon_schema.sql`](supabase/migrations/20260923000000_beacon_schema.sql).

### Table Schema Summary

| Table | Primary Key | Foreign Keys / Relationships | Record Count | Description |
| :--- | :--- | :--- | :--- | :--- |
| `road_segments` | `id` (UUID), `segment_id` (Unique) | — | 160 | Road corridor segments with GeoJSON LineString geometry |
| `bus_passes` | `id` (UUID), `pass_id` (Unique) | — | 60 | Vehicle runs across 10 simulated buses |
| `segment_conditions` | `id` (UUID), `segment_id` (Unique) | `segment_id` ➔ `road_segments(segment_id)` | 160 | Pre-aggregated health scores and hazard counts for travellers |
| `road_events` | `id` (UUID), `event_id` (Unique) | `pass_id` ➔ `bus_passes`, `segment_id` ➔ `road_segments` | 4,323 | Labelled road hazard events with ML prediction columns |
| `suppressed_events` | `id` (UUID), `event_id` (Unique) | `pass_id` ➔ `bus_passes`, `segment_id` ➔ `road_segments` | 74 | Driver maneuvers suppressed to avoid false positives |
| `sensor_data` | `id` (BIGSERIAL) | `pass_id` ➔ `bus_passes`, `segment_id` ➔ `road_segments` | 1,426,279 | 10Hz raw/sampled IMU acceleration + gyroscope telemetry |

### Machine Learning Readiness
The `road_events` table includes future-proof ML prediction attributes:
- `prediction_source`: `'GROUND_TRUTH'` vs `'ML_PREDICTED'`
- `model_version`: Identifier for the deployed inference model
- `predicted_event_type`: Classified event class
- `prediction_confidence`: Model confidence score ($0.0 - 1.0$)

---

## Synthetic Dataset Ingestion & CLI Tools

The synthetic dataset files reside in `data/synthetic/`:
- `road_segments.csv` (160 rows)
- `road_segments.geojson` (160 LineString features)
- `bus_passes.csv` (60 vehicle passes)
- `segment_summary.csv` (160 segment condition summaries)
- `events_ground_truth.csv` (4,323 labelled hazard events)
- `suppressed_events.csv` (74 suppressed maneuvers)
- `sensor_data.csv` (1,426,279 rows of 10Hz IMU + GPS telemetry)

### 1. Ingestion CLI (TypeScript / Bun / Node)

Run dataset validation and ingestion via the included CLI tool:

```bash
# Validate data integrity (DRY-RUN mode, no writes)
bun run db:import --dry-run

# Generate a production-ready SQL seed file (supabase/seed.sql)
bun run db:seed-sql

# Import directly to live Supabase (requires .env configuration)
bun run db:import

# Include sampled sensor telemetry stream
bun run db:import --include-sensor-data --sensor-limit 10000
```

### 2. Ingestion CLI (Python 3 Alternative)

For data engineering pipelines:

```bash
# Dry run validation
python scripts/import_synthetic_dataset.py --dry-run

# Generate SQL seed
python scripts/import_synthetic_dataset.py --generate-sql
```

### 3. Verify Data Access Layer Queries

To verify that the typed database client in `src/lib/beacon-db.ts` executes queries against segments, conditions, events, and bus passes:

```bash
bun run db:verify
```

---

## Environment Setup

Create a `.env` file in the root directory by copying `.env.example`:

```bash
cp .env.example .env
```

Configure your credentials:

```env
# Supabase Project URL
VITE_SUPABASE_URL="https://your-project.supabase.co"

# Supabase Public Anon Key (for public browser traveller queries)
VITE_SUPABASE_ANON_KEY="your-anon-key-here"

# Supabase Service Role Key (for administrative scripts/data ingestion only)
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"
```

> [!TIP]
> If Supabase credentials are not configured, Beacon automatically and transparently operates in **Offline Synthetic Mode**, serving the full dataset from local files (`public/data/synthetic/`) without runtime errors.

---

## Machine Learning Road-Event Detection Engine (`beacon-event-rf-v1`)

Beacon incorporates an offline-trained Machine Learning event detection engine that classifies high-frequency bus telemetry into catalogued road hazards.

> [!WARNING]
> **Synthetic Dataset Limitation Disclaimer**
> Beacon's ML prototype is trained and evaluated using synthetic/demo sensor data. Its evaluation metrics do not represent real-world KSRTC road-condition detection accuracy.

### Architectural Separation: Offline ML Pipeline vs Web Application

```
┌────────────────────────────────────────────────────────────────────────┐
│                   1. OFFLINE ML PIPELINE (Python)                      │
└────────────────────────────────────────────────────────────────────────┘
 Raw Synthetic Telemetry (sensor_data.csv, 10Hz)
                    │
                    ▼
 5-Second Temporal Windows (50 samples, [T - 2.5s, T + 2.5s])
                    │
                    ▼
 Feature Extraction (34 kinematic, jerk & statistical features)
                    │
                    ▼
 GroupShuffleSplit (pass_id grouping: 48 train passes / 12 test passes)
                    │
                    ▼
 RandomForestClassifier (beacon-event-rf-v1, class_weight='balanced')
                    │
                    ▼
 Model Evaluation & Artifacts Generation
  ├── ml/models/beacon_event_rf_v1.pkl
  ├── ml/models/model_metadata.json
  ├── ml/output/metrics.json
  ├── ml/output/confusion_matrix.png
  └── ml/output/demo_prediction.json ──► Copied to public/data/ml/

┌────────────────────────────────────────────────────────────────────────┐
│                   2. WEB APPLICATION (React / TanStack)                │
└────────────────────────────────────────────────────────────────────────┘
 public/data/ml/demo_prediction.json & model_metadata.json
                    │
                    ▼
 Contributor Mode ML Detection Panel (zero Python process execution at runtime)
                    │
                    ▼
 Displays True Model Prediction, Confidence (predict_proba), Matched Segment, Suppression
```

### Complete End-to-End ML Pipeline

```
Raw Sensor Stream (10 Hz)
       │
       ▼
5-Second Temporal Window (50 samples: ax, ay, az, gx, gy, gz, speed, coords)
       │
       ▼
Feature Extraction (34 explainable stats: mean, std, min, max, magnitude, jerk, speed delta)
       │
       ▼
RandomForestClassifier (beacon-event-rf-v1)
       │
       ├───> Class Prediction (NORMAL, POTHOLE, SPEED_BREAKER, BROKEN_PATCH, ROUGHNESS)
       └───> Class Probability (confidence from model.predict_proba())
       │
       ▼
Decision Gate:
  • Is class == NORMAL? ───> Discard (not a road hazard)
  • Is confidence < 0.60? ───> Suppressed (LOW_CONFIDENCE)
  • Context filter (speed < 5 km/h, hard braking, sharp turning)? ───> Suppressed (recorded in suppressed_events)
  • Passed all filters? ───> Accepted
       │
       ▼
Geospatial Map Matching (Point-to-segment distance against 160 corridors)
       │
       ▼
Final Road Event (prediction_source = "ML", model_version = "beacon-event-rf-v1")
```

### 1. Windowing & NORMAL Window Strategy
- **Window Size**: 5.0 seconds at 10 Hz ($\approx 50$ samples per window).
- **Event Windows**: 4,180 distinct event windows centered at peak acceleration timestamps across all 4 ground-truth hazard classes. 143 overlapping events ($< 5.0\text{s}$ gap on the same segment) were resolved deterministically by retaining the higher severity event.
- **NORMAL Windows**: 1,300 pure normal windows extracted from non-event corridors using strict exclusion zones (excluding all timestamps within $\pm 5\text{s}$ of any event, and selecting cruising periods with speed $> 15\text{ km/h}$).

### 2. Grouped Split & Zero Data Leakage
- Grouped by `pass_id` via `GroupShuffleSplit(n_splits=1, test_size=0.20, random_state=42)`.
- **Train Passes**: 48 passes (4,372 windows).
- **Test Passes**: 12 passes (1,108 windows).
- **Leakage Verification**: Programmatically verified $\text{set}(\text{train\_passes}) \cap \text{set}(\text{test\_passes}) = \emptyset$.

### 3. Feature Engineering (34 Features)
| Category | Count | Feature Names |
| :--- | :--- | :--- |
| **Accelerometer** | 19 | `ax_mean`, `ay_mean`, `az_mean`, `ax_std`, `ay_std`, `az_std`, `ax_min`, `ay_min`, `az_min`, `ax_max`, `ay_max`, `az_max`, `accel_magnitude_mean`, `accel_magnitude_std`, `accel_magnitude_max`, `jerk_mean`, `jerk_std`, `jerk_max`, `vertical_acceleration_peak` |
| **Gyroscope** | 8 | `gx_mean`, `gy_mean`, `gz_mean`, `gx_std`, `gy_std`, `gz_std`, `gyro_magnitude_mean`, `gyro_magnitude_std` |
| **Vehicle Speed** | 5 | `speed_mean`, `speed_std`, `speed_min`, `speed_max`, `speed_change` |
| **Temporal** | 2 | `window_duration`, `sample_count` |

### 4. Class Distribution & Benchmark Evaluation
- **Model Type**: `RandomForestClassifier(n_estimators=200, max_depth=16, class_weight='balanced', random_state=42)`
- **Model Version**: `beacon-event-rf-v1`

| Class | Total Samples | Precision | Recall | F1-Score |
| :--- | :--- | :--- | :--- | :--- |
| `NORMAL` | 1,300 | 1.000 | 1.000 | 1.000 |
| `POTHOLE` | 1,386 | 0.985 | 0.954 | 0.970 |
| `SPEED_BREAKER` | 1,100 | 1.000 | 1.000 | 1.000 |
| `BROKEN_PATCH` | 778 | 0.951 | 0.951 | 0.951 |
| `ROUGHNESS` | 916 | 0.910 | 0.955 | 0.932 |
| **Overall (Macro / Weighted)** | **5,480** | **Macro: 0.969** | **Macro: 0.972** | **Macro F1: 0.971** (Weighted: 0.974) |

- **Overall Test Accuracy**: **97.38%**
- **Confusion Matrix**: Saved at [`ml/output/confusion_matrix.png`](ml/output/confusion_matrix.png) and [`public/data/ml/confusion_matrix.png`](public/data/ml/confusion_matrix.png).

### 5. False-Positive Suppression Layer
Evaluates contextual kinematic signals to suppress false alarms:
- **Stationary / Low Speed** ($< 5\text{ km/h}$): Suppressed as `BUS_STOP_DEPARTURE`.
- **Sharp Turning** ($\text{gyro\_magnitude} > 0.45\text{ rad/s}$): Suppressed as `SHARP_TURN`.
- **Hard Braking** ($a_x < -3.5\text{ m/s}^2$ or speed drop $> 18\text{ km/h}$): Suppressed as `HARD_BRAKING`.
- **Rapid Acceleration** ($a_x > 3.0\text{ m/s}^2$): Suppressed as `RAPID_ACCELERATION`.
- **Low Confidence** ($\text{confidence} < 0.60$): Suppressed as `LOW_CONFIDENCE`.

### 6. Map Matching
Uses point-to-segment Euclidean distance matching against all 160 corridors in `road_segments.csv`. Preserves original raw GPS coordinates while tagging the closest `segment_id`.

### 7. ML Pipeline CLI Commands

```bash
# 1. Extract 5-second windows and compute 34 features
bun run ml:prepare

# 2. Train balanced Random Forest classifier (beacon-event-rf-v1)
bun run ml:train

# 3. Evaluate model on held-out passes and generate metrics
bun run ml:evaluate

# 4. Run deterministic demo inference (PREVIEW ONLY, no DB writes)
bun run ml:demo

# 5. Run demo inference with explicit database write
bun run ml:demo:write
```

---

## Beacon Road Condition Intelligence Layer (Prompt 3)

The core Beacon transformation aggregates repeated independent bus-pass observations across corridors into transparent, explainable road condition intelligence.

> [!WARNING]
> **Synthetic Dataset & Prototype Estimate Disclaimer**
> The current prototype uses synthetic KSRTC-style observations. Condition scores and observation confidence ratings are demonstration estimates and have not been validated against real-world KSRTC road-condition measurements.
> Always use wording: *"Demo data • Synthetic KSRTC-style observations"* and *"Prototype road-condition estimate"*.

### Repeated Observations Architecture

```
                 CONTRIBUTOR
                      │
                 BUS SENSORS (10 Hz)
                      │
                      ▼
             ML Event Classifier (beacon-event-rf-v1)
                      │
                      ▼
                 ROAD EVENTS
                      │
                      ▼
            FALSE-POSITIVE FILTER (Kinematic context)
                      │
                      ▼
               ACCEPTED EVENTS (4,323 events)
         [74 Suppressed non-hazards excluded]
                      │
          ┌───────────┼───────────┐
          │           │           │
       Pass 01     Pass 02     Pass N (60 Passes / 10 Buses)
          │           │           │
          └───────────┼───────────┘
                      ▼
             SEGMENT AGGREGATION
                      │
           ┌──────────┼──────────┐
           ▼          ▼          ▼
        Frequency  Severity  Confidence
           │          │          │
           └──────────┼──────────┘
                      ▼
               CONDITION SCORE (0–100)
                      │
             ┌────────┼────────┐
             ▼        ▼        ▼
           GOOD   MODERATE    POOR
          (≥80)   (50–79)    (<50)
             │        │        │
             └────────┼────────┘
                      ▼
                TRAVELLER MAP
```

### 1. Hazard Weights
Civil engineering severity weights reflecting dynamic impact on vehicular ride quality and road safety:
```typescript
export const HAZARD_WEIGHTS = {
  POTHOLE: 1.25,
  BROKEN_PATCH: 1.10,
  SPEED_BREAKER: 0.70,
  ROUGHNESS: 0.50,
} as const;
```

### 2. Deterministic Condition Score Formula (0–100)
Segment scores start at baseline $100.0$ and subtract three explainable penalties:

$$\text{Severity Penalty} = (\bar{S} \times 5.5) \times r_{\text{affected}}$$

$$\text{Density Penalty} = \min\left(25.0, \frac{\text{WeightedEvents}}{\text{Length} / 100} \times \frac{40.0}{\text{TotalPasses}}\right)$$

$$\text{Persistence Penalty} = (r_{\text{affected}} \times 12.0) \times r_{\text{bus}}$$

$$\text{Condition Score} = \max(0.0, \min(100.0, 100.0 - (\text{Severity Penalty} + \text{Density Penalty} + \text{Persistence Penalty})))$$

Where:
- $r_{\text{affected}} = \frac{N_{\text{affected\_passes}}}{N_{\text{total\_passes}}}$ (Fraction of independent passes encountering hazards).
- $r_{\text{bus}} = \frac{N_{\text{unique\_buses}}}{N_{\text{fleet\_buses}}}$ (Cross-bus confirmation ratio; dynamically calculated, 10 buses in synthetic fleet).
- $\text{WeightedEvents} = 1.25 \cdot N_{\text{pot}} + 1.10 \cdot N_{\text{bp}} + 0.70 \cdot N_{\text{sb}} + 0.50 \cdot N_{\text{ro}}$.
- $\bar{S} \in [1.0, 5.0]$ (Mean observed event severity).
- Pristine zero-event corridors receive baseline condition score $95.0$.

### 3. Observation Confidence Formula (0–100%)
Confidence reflects the volume and reliability of independent observations, not road quality:

$$C_{\text{saturation}} = 1 - e^{-N_{\text{passes}} / 14}$$

$$C_{\text{bus}} = 0.5 + 0.5 \times \frac{N_{\text{unique\_buses}}}{N_{\text{fleet\_buses}}}$$

$$\text{Observation Confidence} = \min(99.5\%, \max(5.0\%, C_{\text{saturation}} \times C_{\text{bus}} \times \bar{C}_{\text{detector}} \times 100))$$

- **Observation Saturation**: 1 pass $\approx 10\%$, 10 passes $\approx 51\%$, 60 passes $\approx 98.6\%$.
- **Bounded**: Strictly constrained between $5.0\%$ and $99.5\%$ (never claims statistical certainty).

### 4. Condition Classes
- **GOOD** ($\text{Score} \ge 80.0$): Colored Green (`#10b981`).
- **MODERATE** ($50.0 \le \text{Score} < 80.0$): Colored Amber (`#f59e0b`).
- **POOR** ($\text{Score} < 50.0$): Colored Red (`#ef4444`).

### 5. Length-Weighted Network Condition Score
$$\text{Network Score} = \frac{\sum_{i=1}^{M} (\text{Score}_i \times \text{Length}_i)}{\sum_{i=1}^{M} \text{Length}_i}$$
- **Current Network Score**: **74.4 / 100** (Length-weighted across 160 corridors).
- **Corridor Distribution**: **72 GOOD · 78 MODERATE · 10 POOR**.

### 6. Critical Data Policies
- **Pass-Level vs Event-Level Separation**: 1 bus pass with 5 potholes counts as **1 affected pass** and **5 events**, preventing a single pass from dominating condition ratings.
- **Suppressed Events Exclusion**: All 74 candidate events in `suppressed_events.csv` (maneuvers, braking artifacts, bus stop departures) are strictly excluded from hazard counts and penalties.
- **No Double-Counting**: Ground-truth accepted events power the baseline condition layer; ML predictions are kept separate and never summed into the same observation count.

### 7. Example Corridor Lineage (`SEG_024`)
- **Corridor**: `SEG_024` (NH_CORRIDOR_A, Highway, 112.4m)
- **Observations**: 60 passes across 10 buses
- **Affected Passes**: 46 passes
- **Catalogued Hazards**: 46 accepted speed breakers (0 potholes, 0 broken patches, 0 roughness)
- **Mean Severity**: 2.91 / 5 | **Mean Detector Confidence**: 95.5%
- **Condition Score**: **59.4 / 100** [MODERATE]
- **Observation Confidence**: **83.1%**
- **Filtered Non-Hazards**: 3 candidate events suppressed by false-positive filter

### 8. Condition CLI Commands

```bash
# 1. Preview aggregation calculations without filesystem or DB writes
bun run conditions:aggregate:dry

# 2. Run active idempotent aggregation (updates CSVs, JSON report, and Supabase)
bun run conditions:aggregate

# 3. Run automated 12-rule integrity verification suite
bun run conditions:verify
```

---

## Local Development

### Prerequisites
- Node.js (v18+) or Bun (v1.1+)
- Python 3.10+ (for offline ML training/evaluation)

### Installation & Run

```bash
# 1. Install frontend dependencies
bun install

# 2. Start development server
bun run dev

# 3. Type check & production build
bun x tsc --noEmit
bun run build
```

---

## License

MIT License.

---

## Beacon Automatic Trip Detection Engine (Prompt 4)

### How Beacon Detects a Trip

Every KSRTC bus journey is automatically detected without the passenger or driver having to press a single button.

#### State Machine

Beacon's trip detection is implemented as a **pure deterministic state machine** in [`src/lib/trip-state-machine.ts`](src/lib/trip-state-machine.ts). It runs on GPS updates and has no React dependencies — making it fully headless and unit-testable.

```
┌────────────────────────────────────────────────────────────────────────┐
│                     BEACON TRIP STATE MACHINE                          │
└────────────────────────────────────────────────────────────────────────┘

  IDLE  ──── speed ≥ 5 km/h ────────────────────────────► MOVEMENT_DETECTED
    ▲                                                             │
    │   speed drops < 5 km/h (GPS drift / noise)                 │
    │◄──────────────────────────────────────────────────────────  │
    │                                                             │
    │   Sustained ≥ 25 sec OR displacement > 80 m                │
    │                                                             ▼
    │                                                        TRIP_ACTIVE
    │                                                             │
    │   speed < 2 km/h                                           │
    │                                                             ▼
    │                                                      TEMPORARY_STOP
    │                                                        │         │
    │   Stationary ≥ 240 sec (4 min)                         │         │
    │◄───────────────────────────────────────────────────────┘         │
    │                                                                   │
    │   speed ≥ 5 km/h OR displaced > 30 m                             │
    │                                                                   ▼
    │                                                        (back to TRIP_ACTIVE)
    │
    │   TRIP_COMPLETED (terminal — caller resets to IDLE on dismiss)
```

#### State Labels

| State | User-visible label | Meaning |
|---|---|---|
| `IDLE` | Waiting for movement | Bus is parked or GPS not yet active |
| `MOVEMENT_DETECTED` | Detecting trip… | Speed ≥ 5 km/h detected, verifying it's genuine |
| `TRIP_ACTIVE` | Trip Active | Confirmed bus journey in progress |
| `TEMPORARY_STOP` | Temporary Stop | Bus stopped briefly (traffic light / bus stop) |
| `TRIP_COMPLETED` | Trip Completed | Bus has been stationary for 4 minutes |

#### Thresholds

| Constant | Value | Purpose |
|---|---|---|
| `MOVEMENT_START_SPEED_KMH` | `5.0` | Minimum speed to enter MOVEMENT_DETECTED |
| `STOP_SPEED_KMH` | `2.0` | Speed below which a stop is detected |
| `MOVEMENT_CONFIRM_SECONDS` | `25` | Seconds of sustained movement to confirm trip start |
| `TRIP_END_STATIONARY_SECONDS` | `240` | Seconds stationary before trip is finalised |
| `STOP_RADIUS_METERS` | `30` | Radius within which bus is still considered at the same stop |
| `MAX_OFFLINE_BUFFER_SIZE` | `500` | Maximum observations buffered when offline |
| `BATCH_FLUSH_INTERVAL_MS` | `5000` | How often the observation batch is flushed when online |

#### Sensor Collector

[`src/lib/live-sensor-collector.ts`](src/lib/live-sensor-collector.ts) wraps:
- `navigator.geolocation.watchPosition` (GPS) — with iOS/Android permission handling
- `DeviceMotionEvent` (accelerometer + gyroscope) — with iOS 13+ permission API
- `window.online` / `window.offline` events — for network detection
- Offline observation buffer (ring buffer, max 500 entries, auto-flush on reconnect)
- Road-segment map matching (50 m buffer, closest segment wins)

#### Sensor Status Indicators

The `LiveTripStatus` card shows three live indicator pills:

| Pill | States |
|---|---|
| **Location** | GPS connecting / GPS ready / GPS weak / GPS denied / GPS unavailable |
| **Motion** | Motion (available) / Motion: allow / No motion sensor |
| **Network** | Online / Offline + queued count |

#### CLI Commands

```bash
# Run the 20 automated unit tests for the state machine
bun run trips:test

# Run the 35-check trip integrity verification (offline, no DB needed)
bun run trips:verify
```

#### Architecture Notes

- The state machine is **pure** — `transitionTripState()` takes the current state + a new GPS point and returns the next state without any side effects.
- React state is only updated in `trip-context.tsx` — the state machine never touches React.
- The `LiveSensorCollector` class is instantiated inside a `useEffect` and cleaned up on unmount. During demo simulation it is stopped so the simulation controls the state machine directly.
- All trip data uses `source: "LIVE" | "MANUAL" | "DEMO"` to indicate data provenance.

---

## Beacon End-to-End Intelligence Integration & Demo Hardening (Prompt 5)

### 1. End-to-End Pipeline

Beacon connects everyday bus journeys to passenger road intelligence through a single, verifiable pipeline:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   BEACON END-TO-END DATA ARCHITECTURE                  │
└────────────────────────────────────────────────────────────────────────┘

  A. CONTRIBUTOR MODE (Live or Demo Sensing)
     Bus in transit (Auto-detected / Manual / Demo)
              │
              ▼
     GPS + Motion Collector
     ├── Live: navigator.geolocation + DeviceMotionEvent (source: LIVE)
     └── Demo: Waypoint generator with simulated pause/resume (source: DEMO)
              │
              ▼
     Observation Buffer & Segment Matcher (50m corridor buffer)
              │
              ▼
     Event Detection & Suppression Filter
     ├── ML Pipeline: 34 kinematic/jerk features, 5s temporal windows (source: ML)
     └── Suppression: Hard braking, sharp turns excluded from hazard tally
              │
              ▼
     Completed Trip Summary ("ROAD INTELLIGENCE CONTRIBUTED")
     └── Summarizes observed corridors & detected events (UI summary only)

  B. TRAVELLER MODE (Road Condition Intelligence)
     segment_conditions (Authoritative Prompt 3 Aggregation)
              │
              ▼
     Traveller Dashboard & Map
     ├── Length-weighted Network Condition (Dynamic: 74.4 / 100, 72G · 78M · 10P)
     ├── Segment Inspector: Condition score, confidence, hazard breakdown
     └── "Why this score?": Deterministic human-readable explanation
              │
              ▼
     Presentation Mode: Optimized for projector / 10-foot legibility
```

### 2. Strict Data Provenance Isolation

Every event and observation in Beacon carries an explicit `source` tag:

| Source | Definition | Example |
|---|---|---|
| `SYNTHETIC` | Seeded benchmark observations and ground-truth events | `events_ground_truth.csv`, `segment_conditions_generated.csv` |
| `ML` | Produced by the trained Random Forest classifier (`beacon-event-rf-v1`) | `ml/output/demo_prediction.json` |
| `LIVE` | Sourced directly from browser `watchPosition` and `DeviceMotionEvent` | Live contributor trips on active device |
| `DEMO` | Simulated trajectory waypoints in demo mode | Hackathon interactive demo run |

> [!IMPORTANT]
> **No Fabricated Live Results**: Synthetic/demo records are never marked `LIVE`. Completed trip summaries (`Trip.affected_segments`) are strictly UI contribution summaries and do not overwrite the authoritative `segment_conditions` table.

### 3. Contributor Mode Features

- **`BEACON IS COLLECTING` Active Banner**: Live duration, distance, speed, buffered observations counter, and hazard events counter.
- **Interactive Demo Controls**: `Start Demo Trip`, `Pause`, `Resume`, `End Demo Trip`, `Reset Demo` for hands-off presentation.
- **`ROAD INTELLIGENCE CONTRIBUTED` Completed Summary**:
  - Distance traveled (e.g. 18.2 km)
  - Observations captured (e.g. 1,284 observations)
  - Accepted hazards detected (e.g. 5 hazards)
  - Monitored corridors list with individual hazard status (`HAZARD_DETECTED` vs `OBSERVED`)
  - Disclaimer: *"Contributed observations queued for condition aggregation • Synthetic KSRTC-style demonstration"*

### 4. Traveller Mode Features

- **Length-Weighted Network Score**: Dynamic network health score (74.4 / 100) computed from all 160 corridors (72 Good, 78 Moderate, 10 Poor).
- **Segment Inspector Card**:
  - Condition Score & Class (GOOD / MODERATE / POOR)
  - Observation Confidence (%)
  - Observed passes and fleet buses
  - Hazard breakdown (Potholes, Speed Breakers, Broken Patches, Roughness)
  - Filtered non-hazards (suppressed maneuvers count)
- **Deterministic Explainability ("Why this score?")**:
  - **GOOD**: *"Few accepted hazards have been observed across repeated bus passes. Baseline structural integrity remains sound."*
  - **MODERATE**: *"Some recurring road issues have been observed across multiple passes. Moderate structural degradation detected."*
  - **POOR**: *"Repeated higher-severity hazards (including X accepted potholes) confirmed across Y passes caused the segment score to decrease significantly."*
  - **Low Confidence (< 50%)**: *"More observations are needed across additional fleet passes to increase observation confidence."*
- **Dynamic Data Freshness**: Derived automatically from the latest event timestamp in the dataset.
- **Compact Map Legend**: Clear color codes + guidance: *"Observation confidence represents observation volume across multiple passes, not probability of safety."*

### 5. Presentation Mode

Toggle via the **Presentation** button in the top navigation bar.
- Increases map visibility and expands high-contrast KPI cards.
- Simplifies secondary UI elements for clean projector display.
- High legibility for 10-foot viewing during pitch decks and jury demonstrations.

---

### 6. Hackathon 2–3 Minute Demonstration Script

Follow these steps to demonstrate Beacon's end-to-end intelligence during jury evaluations:

1. **Opening Statement (15 sec)**:
   - *"Every participating KSRTC bus becomes a moving beacon for road condition intelligence."*
   - Open Beacon on [http://localhost:5173/](http://localhost:5173/). Notice the Contributor sensing header.

2. **Start Contributor Demo Trip (30 sec)**:
   - Tap **"Start Demo Trip (Kochi Corridor)"**.
   - Point out zero-touch trip state transition: `IDLE` → `MOVEMENT_DETECTED` → `TRIP_ACTIVE`.
   - Note the **"BEACON IS COLLECTING"** banner, observations counter incrementing, and live speed.
   - Tap **Pause** and **Resume** on the demo controls to show examiner control.

3. **In-Transit Event & Stop Detection (30 sec)**:
   - At waypoint 2/3 (`SEG_036`), note an accepted road hazard detection (Pothole, 95.8% confidence).
   - At waypoint 5 (`Edappally Signal`), note the state changes to `TEMPORARY_STOP` (traffic signal handling).

4. **Trip Completion & Contributed Intelligence (30 sec)**:
   - The trip reaches `Aluva Private Bus Stand` and transitions to `TRIP_COMPLETED`.
   - Show the **"ROAD INTELLIGENCE CONTRIBUTED"** card:
     - 18.2 km, 1,284 observations recorded, 5 accepted hazards.
     - Sample corridors list: `SEG_036` (Pothole detected), `SEG_041` (Roughness), `SEG_052` (Monitored · 0 hazards).

5. **Switch to Traveller Mode (30 sec)**:
   - Tap the Mode Switcher at top right to switch to **🧭 Traveller Mode**.
   - Show the dynamic status bar: Network Condition (74.4 / 100), 160 corridors, 4,323 hazards catalogued, 74 non-hazards filtered.
   - Navigate to **Road Map** and click corridor `SEG_036` or `SEG_024`.
   - Highlight the **"Why this score?"** card: Explain that Beacon doesn't rely on a single passenger or phone—repeated multi-bus observations build statistical confidence in road condition.

6. **Presentation Mode (15 sec)**:
   - Tap the **Presentation** button in the header bar to optimize the display for a projector.

---

### 7. Verification & Test Commands

```bash
# 1. Database Access Layer & Fallback Verification
bun run db:verify

# 2. Python ML Event Detection Pipeline Tests
python ml/test_ml_pipeline.py

# 3. Road Condition Intelligence Aggregation Verification
bun run conditions:verify

# 4. Pure Trip State Machine Unit Tests (20 tests)
bun run trips:test

# 5. Trip Integrity Verification (35 checks)
bun run trips:verify

# 6. End-to-End Pipeline Integration Verification (28 checks)
bun run e2e:verify

# 7. Strict TypeScript Compilation Check
bun x tsc --noEmit

# 8. Full Production Build (Client + Server + Prerender)
bun run build
```

---

## 8. Production Vercel Deployment & Real Phone Testing

Beacon is pre-configured for zero-friction HTTPS deployment on Vercel with mobile sensor support (Geolocation + DeviceMotionEvent), automatic static route prerendering, and deterministic Demo Mode fallback.

### Deployment Walkthrough

1. **Push Repository to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "feat: production deployment hardening for Vercel"
   git remote add origin https://github.com/your-username/beacon.git
   git branch -M main
   git push -u origin main
   ```

2. **Create / Connect Project in Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new) and import your Beacon repository.
   - Framework Preset: **Vite** (auto-detected via `vercel.json`).
   - Build Command: `bun run build` (or `npm run build`).
   - Output Directory: `dist/client`.

3. **Configure Environment Variables**:
   In the Vercel Project Settings → **Environment Variables**, add:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-publishable-key
   ```
   > [!NOTE]
   > Do **NOT** add `SUPABASE_SERVICE_ROLE_KEY` to Vercel client environment variables. Service-role keys are strictly for offline administrative ingestion scripts (`scripts/`).
   > If Supabase variables are omitted, Beacon automatically and safely operates in **Offline Synthetic Mode** with 100% feature availability.

4. **Deploy**:
   - Click **Deploy**. Vercel will run the build, prerender all static HTML pages, and assign a production HTTPS URL (e.g., `https://beacon-roadsense.vercel.app`).

### Testing on a Real Mobile Phone (HTTPS Required)

5. **Open Deployed HTTPS URL on Your Phone**:
   - Open Safari (iOS) or Chrome (Android) and navigate to your deployed HTTPS URL.
   - Modern browser sensor APIs (`navigator.geolocation` and `DeviceMotionEvent`) strictly require a secure HTTPS context.

6. **Grant Location Permission**:
   - When prompted by the browser, tap **"Allow"** or **"While Using App"** for Location.
   - The indicator pill in the sensing header will switch to `GPS ready` (green).

7. **Grant Motion Permission (iOS)**:
   - On iOS 13+ Safari, motion sensors require an explicit user gesture.
   - Tap the **"Motion: tap to allow"** pill or the **"Allow Motion Sensors"** prompt button.
   - Tap **"Allow"** on the iOS system prompt. The pill will switch to `Motion ready`.
   - On Android devices, motion sensors initialize automatically without a prompt.

8. **Select Contributor Mode**:
   - Ensure the mode toggle is set to **Contributor Sensing** (zero-touch automated trip detection).

9. **Start Live Trip or Walk/Drive**:
   - Begin walking or driving (> 5 km/h) to observe automatic trip detection (`MOVEMENT DETECTED` → `TRIP ACTIVE`).
   - Alternatively, tap **"Start Trip Manually"** to begin recording immediately.

10. **Fallback to Demo Mode (Guaranteed Hackathon Defense)**:
    - If GPS or motion permissions are denied or unavailable (e.g. indoors, underground transit, laptop testing), tap **"Start Demo Trip (Kochi Corridor)"** or **"Continue in Demo Mode"**.
    - Demo Mode runs a deterministic 10-waypoint sequence along the Kakkanad–Aluva transit corridor with full event detection simulation, guaranteed 0% failure risk.

11. **Switch to Traveller Mode**:
    - Tap **Traveller** in the header toggle to inspect aggregated road-condition intelligence (`segment_conditions`), condition scores (Good / Moderate / Poor), confidence levels, and hazard breakdowns across the 160 transit corridors.

