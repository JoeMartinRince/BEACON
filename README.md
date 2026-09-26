# Beacon — KSRTC Road-Condition Sensing & Intelligence Platform

Beacon crowdsources high-resolution road quality measurements using public transit fleets (such as Kerala State Road Transport Corporation — KSRTC). By analyzing GPS traces and IMU sensor data from routine bus runs, Beacon detects road hazards, filters false positives, and provides corridor health intelligence to travellers and transport planners.

> [!NOTE]
> **Synthetic Dataset Included**: The repository contains a benchmark dataset representing 160 corridors around Kochi/Ernakulam, Kerala (60 simulated bus passes, 4,323 labelled hazard events). The app runs fully offline out of the box.

---

## Architecture Overview

```
 [ KSRTC Fleet Observations ]
       │  Onboard GPS + IMU (10Hz)
       ▼
 [ Trip Detection & Buffering ] ──► Pure state machine (IDLE ➔ TRIP_ACTIVE ➔ COMPLETED)
       │
       ▼
 [ ML Hazard Classification ]   ──► beacon-event-rf-v1 (Pothole, Speed Breaker, Patch, Roughness)
       │
       ▼
 [ False-Positive Filter ]      ──► Suppresses braking, sharp turns, bus-stop stops
       │
       ▼
 [ Corridor Aggregation ]       ──► Deterministic 0–100 condition score & confidence rating
       │
       ▼
 [ Public Traveller Map ]       ──► Interactive route health, segment inspector & explainability
```

---

## Core Capabilities

### 1. Zero-Touch Trip Detection
- Headless, deterministic finite-state machine ([`trip-state-machine.ts`](src/lib/trip-state-machine.ts)) transitions across `IDLE`, `MOVEMENT_DETECTED`, `TRIP_ACTIVE`, `TEMPORARY_STOP`, and `TRIP_COMPLETED`.
- Captures live GPS and motion sensors via browser APIs, with an offline ring buffer for intermittent connectivity.
- Includes a 10-waypoint deterministic simulation mode for live demonstrations.

### 2. ML Road Hazard Detection (`beacon-event-rf-v1`)
- Balanced Random Forest classifier trained on 34 kinematic and jerk features extracted from 5-second temporal windows.
- Detects four primary road hazards: `POTHOLE`, `SPEED_BREAKER`, `BROKEN_PATCH`, and `ROUGHNESS`.
- **False-Positive Suppression**: Rejects normal vehicle dynamics (sharp turning $> 0.45\text{ rad/s}$, hard braking $> 3.5\text{ m/s}^2$, bus-stop departures $< 5\text{ km/h}$).

### 3. Corridor Health Scoring & Explainability
- Multi-pass aggregation calculates explainable condition scores ($0 - 100$):
  - **Good** ($\ge 80$), **Moderate** ($50 - 79$), **Poor** ($< 50$).
  - Penalties reflect observed hazard severity, hazard density per km, and multi-bus persistence.
- **Observation Confidence** ($5.0\% - 99.5\%$): Measures observation volume across passes rather than guessing safety.
- **Explainable Diagnostics**: Plain-language summaries explain exactly why each corridor received its score.

### 4. Dual Operational Modes
- **Contributor Mode**: Driver/passenger sensing interface showing live speed, distance, buffer status, and trip summaries.
- **Traveller Mode**: Public corridor map with network health KPIs, segment inspection, and a projector-friendly Presentation Mode.

---

## Quick Start

### Prerequisites
- [Bun](https://bun.sh/) (v1.1+) or Node.js (v18+)
- Python 3.10+ (optional, only required for retraining ML models)

### Installation & Development

```bash
# Install dependencies
bun install   # or npm install

# Start development server
bun run dev   # or npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Configuration & Data Modes

Create a `.env` file from the template:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key-here"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here" # For admin ingestion only
```

> [!TIP]
> **Zero-Config Offline Mode**: If Supabase variables are left empty, Beacon automatically serves all data from local synthetic files (`public/data/synthetic/`) with 100% feature parity.

---

## CLI & Testing Scripts

| Category | Command | Description |
|---|---|---|
| **Development** | `bun run dev` | Launch Vite development server |
| | `bun run build` | Build production client bundle |
| | `bun x tsc --noEmit` | Strict TypeScript compilation check |
| **Trip Engine** | `bun run trips:test` | Run 20 unit tests for trip state machine |
| | `bun run trips:verify` | Run 35-check trip integrity suite |
| **Condition Engine**| `bun run conditions:aggregate` | Run multi-pass aggregation on synthetic dataset |
| | `bun run conditions:verify` | Verify 12-rule road condition integrity |
| **Database & E2E**| `bun run db:verify` | Test database client and fallback queries |
| | `bun run e2e:verify` | Run 28 end-to-end integration checks |
| **Machine Learning**| `bun run ml:demo` | Run sample ML hazard classification preview |
| | `bun run ml:train` | Retrain Random Forest classifier (Python) |

---

## Data Schema Summary

| Table / File | Records | Purpose |
|---|---|---|
| `road_segments` | 160 | Corridor definitions with GeoJSON LineString geometry |
| `bus_passes` | 60 | Recorded bus trips across 10 fleet vehicles |
| `segment_conditions` | 160 | Pre-aggregated condition scores, classifications & confidence |
| `road_events` | 4,323 | Labelled road hazard events with ML prediction metadata |
| `suppressed_events` | 74 | Maneuver artifacts filtered to prevent false alarms |
| `sensor_data` | 1,426,279 | 10Hz raw IMU accelerometer and gyroscope telemetry |

---

## Deployment

- **Vercel**: Pre-configured via `vercel.json` for one-click deployment.
- **Mobile Sensor Testing**: Modern browsers require **HTTPS** for `navigator.geolocation` and `DeviceMotionEvent`. Once deployed over HTTPS, open on a mobile device and grant sensor permissions to test live sensing.

---

## License

MIT License.
