"""
Beacon ML - Prepare Dataset
Extracts 5-second temporal sensor windows (50 samples at 10 Hz) for all ground-truth events
and non-event NORMAL periods, extracts 34 kinematic/statistical features, and splits into
train and test sets using GroupShuffleSplit on pass_id to prevent data leakage.
"""

import os
import json
import csv
from collections import defaultdict, Counter
import numpy as np
import polars as pl
from sklearn.model_selection import GroupShuffleSplit
from feature_extraction import extract_features_vector, FEATURE_NAMES

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "synthetic")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "cache")
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")

WINDOW_SAMPLES = 50  # 5.0 seconds at 10 Hz
DT = 0.1  # 100ms sample period

CANONICAL_CLASSES = ["NORMAL", "POTHOLE", "SPEED_BREAKER", "BROKEN_PATCH", "ROUGHNESS"]


def load_raw_data():
    sensor_path = os.path.join(DATA_DIR, "sensor_data.csv")
    events_path = os.path.join(DATA_DIR, "events_ground_truth.csv")
    passes_path = os.path.join(DATA_DIR, "bus_passes.csv")

    print(f"Loading sensor records from {sensor_path}...")
    df_sensor = pl.read_csv(sensor_path)
    print(f"Loaded {df_sensor.shape[0]} sensor rows.")

    print(f"Loading ground truth events from {events_path}...")
    with open(events_path, "r", encoding="utf-8") as f:
        events = list(csv.DictReader(f))
    print(f"Loaded {len(events)} ground-truth events.")

    with open(passes_path, "r", encoding="utf-8") as f:
        passes = list(csv.DictReader(f))
    pass_ids = [p["pass_id"] for p in passes]
    print(f"Loaded {len(pass_ids)} bus passes.")

    return df_sensor, events, pass_ids


def resolve_event_overlaps(events):
    """
    Handle cases where 2 events occur on the same (pass_id, segment_id) within 5 seconds.
    Resolves overlaps deterministically by selecting the higher severity event.
    """
    grouped = defaultdict(list)
    for e in events:
        grouped[(e["pass_id"], e["segment_id"])].append(e)

    resolved_events = []
    overlapping_count = 0

    for (pass_id, seg_id), ev_list in grouped.items():
        if len(ev_list) == 1:
            resolved_events.append(ev_list[0])
        else:
            # Check time gap between peaks
            try:
                t1 = float(ev_list[0]["timestamp_peak"].split(":")[-1])
                t2 = float(ev_list[1]["timestamp_peak"].split(":")[-1])
                diff = abs(t2 - t1)
            except Exception:
                diff = 0.0

            if diff < 5.0:
                overlapping_count += 1
                # Select higher severity, or earlier timestamp
                sev0 = float(ev_list[0].get("severity", 1))
                sev1 = float(ev_list[1].get("severity", 1))
                winner = ev_list[0] if sev0 >= sev1 else ev_list[1]
                resolved_events.append(winner)
            else:
                resolved_events.extend(ev_list)

    print(f"Handled {overlapping_count} overlapping event pairs (retained higher severity).")
    print(f"Total distinct event windows to extract: {len(resolved_events)}")
    return resolved_events


def extract_event_windows(df_sensor, events):
    """
    For each resolved event, extract a 50-sample window centered at its peak.
    """
    # Group sensor df by (pass_id, road_segment_id) for fast indexed lookups
    print("Partitioning sensor data by (pass_id, road_segment_id)...")
    grouped_sensor = df_sensor.partition_by(["pass_id", "road_segment_id"], as_dict=True)

    event_windows = []
    skipped_count = 0

    for ev in events:
        pass_id = ev["pass_id"]
        seg_id = ev["segment_id"]
        ev_type = ev["event_type"].upper().strip()
        if ev_type not in CANONICAL_CLASSES:
            continue

        key = (pass_id, seg_id)
        if key not in grouped_sensor:
            skipped_count += 1
            continue

        seg_df = grouped_sensor[key]
        n_samples = seg_df.shape[0]
        if n_samples < WINDOW_SAMPLES:
            # Pad if needed or skip
            skipped_count += 1
            continue

        # Find closest row index to timestamp_peak
        ts_peak = ev["timestamp_peak"]
        timestamps = seg_df["timestamp"].to_list()
        
        # Binary or linear search for closest timestamp
        peak_idx = n_samples // 2  # default center
        for idx, t in enumerate(timestamps):
            if t >= ts_peak:
                peak_idx = idx
                break

        # Center 50 samples around peak_idx
        start_idx = max(0, min(peak_idx - (WINDOW_SAMPLES // 2), n_samples - WINDOW_SAMPLES))
        end_idx = start_idx + WINDOW_SAMPLES
        win_df = seg_df.slice(start_idx, WINDOW_SAMPLES)

        features = extract_features_vector(
            win_df["accel_x"].to_numpy(),
            win_df["accel_y"].to_numpy(),
            win_df["accel_z"].to_numpy(),
            win_df["gyro_x"].to_numpy(),
            win_df["gyro_y"].to_numpy(),
            win_df["gyro_z"].to_numpy(),
            win_df["speed_kmh"].to_numpy(),
            dt=DT,
        )

        event_windows.append({
            "features": features,
            "label": ev_type,
            "pass_id": pass_id,
            "segment_id": seg_id,
            "latitude": float(ev["latitude"]),
            "longitude": float(ev["longitude"]),
            "timestamp": ev["timestamp_peak"],
            "severity": float(ev.get("severity", 1)),
        })

    print(f"Extracted {len(event_windows)} event windows (skipped {skipped_count}).")
    return event_windows


def extract_normal_windows(df_sensor, events, target_count=1300):
    """
    Extract pure NORMAL windows with exclusion zones:
    1. Identify all ground-truth event segments.
    2. Exclude any segment that had an event or non-normal reading.
    3. Take central 50-sample windows from pure NORMAL corridors where vehicle is cruising (> 15 km/h).
    4. Cap to target_count to keep balanced class distribution.
    """
    print("Extracting NORMAL windows with strict exclusion zones...")
    event_seg_keys = set((e["pass_id"], e["segment_id"]) for e in events)

    # Find segments with 100% NORMAL readings
    grouped_sensor = df_sensor.partition_by(["pass_id", "road_segment_id"], as_dict=True)
    normal_candidates = []

    for (pass_id, seg_id), seg_df in grouped_sensor.items():
        if (pass_id, seg_id) in event_seg_keys:
            continue

        gt_events = seg_df["ground_truth_event"].unique().to_list()
        if len(gt_events) == 1 and gt_events[0] == "NORMAL":
            if seg_df.shape[0] >= WINDOW_SAMPLES:
                mean_spd = float(seg_df["speed_kmh"].mean())
                if mean_spd > 15.0:  # vehicle moving at cruising speed
                    normal_candidates.append(((pass_id, seg_id), seg_df))

    print(f"Found {len(normal_candidates)} pure non-event cruising segments.")

    # Evenly sample across passes to avoid bias towards specific routes
    np.random.seed(42)
    indices = np.random.choice(len(normal_candidates), size=min(target_count, len(normal_candidates)), replace=False)

    normal_windows = []
    for idx in indices:
        (pass_id, seg_id), seg_df = normal_candidates[idx]
        n_samples = seg_df.shape[0]
        start_idx = (n_samples - WINDOW_SAMPLES) // 2
        win_df = seg_df.slice(start_idx, WINDOW_SAMPLES)

        features = extract_features_vector(
            win_df["accel_x"].to_numpy(),
            win_df["accel_y"].to_numpy(),
            win_df["accel_z"].to_numpy(),
            win_df["gyro_x"].to_numpy(),
            win_df["gyro_y"].to_numpy(),
            win_df["gyro_z"].to_numpy(),
            win_df["speed_kmh"].to_numpy(),
            dt=DT,
        )

        normal_windows.append({
            "features": features,
            "label": "NORMAL",
            "pass_id": pass_id,
            "segment_id": seg_id,
            "latitude": float(win_df["latitude"].mean()),
            "longitude": float(win_df["longitude"].mean()),
            "timestamp": win_df["timestamp"][WINDOW_SAMPLES // 2],
            "severity": 0.0,
        })

    print(f"Extracted {len(normal_windows)} NORMAL windows.")
    return normal_windows


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(MODELS_DIR, exist_ok=True)

    df_sensor, events, all_passes = load_raw_data()
    resolved_events = resolve_event_overlaps(events)

    event_windows = extract_event_windows(df_sensor, resolved_events)
    normal_windows = extract_normal_windows(df_sensor, resolved_events, target_count=1300)

    all_windows = event_windows + normal_windows

    # Class distribution reporting
    class_counts = Counter(w["label"] for w in all_windows)
    print("\n==========================================")
    print("TOTAL WINDOWS & CLASS DISTRIBUTION")
    print("==========================================")
    for c in CANONICAL_CLASSES:
        print(f"  {c:15s}: {class_counts[c]} windows")
    print(f"  TOTAL          : {len(all_windows)} windows")

    # Grouped train/test split on pass_id
    X = np.array([w["features"] for w in all_windows], dtype=np.float64)
    y = np.array([w["label"] for w in all_windows])
    groups = np.array([w["pass_id"] for w in all_windows])

    gss = GroupShuffleSplit(n_splits=1, test_size=0.20, random_state=42)
    train_idx, test_idx = next(gss.split(X, y, groups=groups))

    X_train, X_test = X[train_idx], X[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]
    train_passes = sorted(list(set(groups[train_idx])))
    test_passes = sorted(list(set(groups[test_idx])))

    # Programmatic verification of ZERO data leakage
    leakage = set(train_passes).intersection(set(test_passes))
    assert len(leakage) == 0, f"DATA LEAKAGE DETECTED! Overlapping passes: {leakage}"

    print("\n==========================================")
    print("GROUPED TRAIN/TEST SPLIT VERIFICATION")
    print("==========================================")
    print(f"Train passes : {len(train_passes)} passes ({len(train_idx)} windows)")
    print(f"Test passes  : {len(test_passes)} passes ({len(test_idx)} windows)")
    print(f"Data leakage : ZERO (verified set intersection is empty: {leakage})")

    train_dist = Counter(y_train)
    test_dist = Counter(y_test)
    print("\nTrain class distribution:")
    for c in CANONICAL_CLASSES:
        print(f"  {c:15s}: {train_dist[c]}")
    print("\nTest class distribution:")
    for c in CANONICAL_CLASSES:
        print(f"  {c:15s}: {test_dist[c]}")

    # Save to cache
    np.save(os.path.join(OUTPUT_DIR, "X_train.npy"), X_train)
    np.save(os.path.join(OUTPUT_DIR, "y_train.npy"), y_train)
    np.save(os.path.join(OUTPUT_DIR, "X_test.npy"), X_test)
    np.save(os.path.join(OUTPUT_DIR, "y_test.npy"), y_test)
    np.save(os.path.join(OUTPUT_DIR, "groups_train.npy"), groups[train_idx])
    np.save(os.path.join(OUTPUT_DIR, "groups_test.npy"), groups[test_idx])

    # Save sample demo window (e.g. a clear Pothole window from test set)
    pothole_test_indices = [i for i, idx in enumerate(test_idx) if all_windows[idx]["label"] == "POTHOLE"]
    demo_sample = all_windows[test_idx[pothole_test_indices[0]]]
    demo_payload = {
        "features": demo_sample["features"].tolist(),
        "ground_truth_label": demo_sample["label"],
        "pass_id": demo_sample["pass_id"],
        "segment_id": demo_sample["segment_id"],
        "latitude": demo_sample["latitude"],
        "longitude": demo_sample["longitude"],
        "timestamp": demo_sample["timestamp"],
        "severity": demo_sample["severity"],
    }
    with open(os.path.join(OUTPUT_DIR, "demo_sample_window.json"), "w", encoding="utf-8") as f:
        json.dump(demo_payload, f, indent=2)

    metadata = {
        "window_duration_seconds": 5.0,
        "sample_count": WINDOW_SAMPLES,
        "dt": DT,
        "feature_count": len(FEATURE_NAMES),
        "feature_names": FEATURE_NAMES,
        "total_windows": len(all_windows),
        "class_distribution": dict(class_counts),
        "train_passes_count": len(train_passes),
        "test_passes_count": len(test_passes),
        "train_windows_count": len(train_idx),
        "test_windows_count": len(test_idx),
        "train_passes": train_passes,
        "test_passes": test_passes,
    }
    with open(os.path.join(OUTPUT_DIR, "dataset_metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"\nSaved dataset artifacts to {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
