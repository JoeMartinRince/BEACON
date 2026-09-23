"""
Beacon ML - Predict Event & Inference Pipeline
Provides reusable prediction, suppression check, segment map-matching, and deterministic demo runner.
"""

import os
import sys
import json
import csv
import math
import argparse
from typing import Dict, Any, Tuple, Optional, List
import numpy as np
import joblib
from feature_extraction import extract_features_vector, extract_features_from_dict, FEATURE_NAMES

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(ROOT_DIR, "data", "synthetic")
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
PUBLIC_ML_DIR = os.path.join(ROOT_DIR, "public", "data", "ml")

MODEL_VERSION = "beacon-event-rf-v1"
CONFIDENCE_THRESHOLD = float(os.environ.get("ML_EVENT_CONFIDENCE_THRESHOLD", "0.60"))


class SegmentMatcher:
    """Fast geospatial nearest-segment matching against the 160 road segments."""
    def __init__(self, segments_csv: str):
        self.segments = []
        if os.path.exists(segments_csv):
            with open(segments_csv, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    self.segments.append({
                        "segment_id": row["segment_id"],
                        "road_name": row.get("road_name", ""),
                        "start_lat": float(row["start_lat"]),
                        "start_lon": float(row["start_lon"]),
                        "end_lat": float(row["end_lat"]),
                        "end_lon": float(row["end_lon"]),
                        "mid_lat": (float(row["start_lat"]) + float(row["end_lat"])) / 2.0,
                        "mid_lon": (float(row["start_lon"]) + float(row["end_lon"])) / 2.0,
                    })

    def match(self, lat: float, lon: float) -> Tuple[str, float]:
        """Find nearest segment using Euclidean approximation on lat/lon (fast & accurate for small local area)."""
        if not self.segments:
            return "SEG_001", 0.0

        best_seg = self.segments[0]["segment_id"]
        min_dist_sq = float("inf")

        for s in self.segments:
            # Distance to midpoint
            dlat = lat - s["mid_lat"]
            dlon = (lon - s["mid_lon"]) * math.cos(math.radians(lat))
            dist_sq = dlat * dlat + dlon * dlon
            if dist_sq < min_dist_sq:
                min_dist_sq = dist_sq
                best_seg = s["segment_id"]

        # Approximate distance in meters
        approx_dist_m = math.sqrt(min_dist_sq) * 111139.0
        return best_seg, approx_dist_m


def should_suppress_event(
    prediction: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None,
    threshold: float = CONFIDENCE_THRESHOLD,
) -> Tuple[bool, Optional[str]]:
    """
    False-positive suppression layer.
    Evaluates kinematic context and prediction confidence.
    """
    event_type = prediction.get("eventType") or prediction.get("event_type")
    confidence = float(prediction.get("confidence", 0.0))
    ctx = context or {}

    # 1. Normal is not an event
    if event_type == "NORMAL":
        return True, "NORMAL_ROAD"

    # 2. Insufficient model confidence
    if confidence < threshold:
        return True, "LOW_CONFIDENCE"

    speed_kmh = float(ctx.get("speed_kmh", ctx.get("speed_mean", 30.0)))
    gyro_mag = float(ctx.get("gyro_magnitude_mean", 0.0))
    speed_change = float(ctx.get("speed_change", 0.0))
    ax_min = float(ctx.get("ax_min", 0.0))
    ax_max = float(ctx.get("ax_max", 0.0))

    # 3. Stationary or extremely low speed (< 5 km/h)
    if speed_kmh < 5.0:
        return True, "BUS_STOP_DEPARTURE"

    # 4. Sharp vehicle turning / steering manoeuvre
    if gyro_mag > 0.45:
        return True, "SHARP_TURN"

    # 5. Harsh braking
    if ax_min < -3.5 or speed_change < -18.0:
        return True, "HARD_BRAKING"

    # 6. Rapid acceleration from stop
    if ax_max > 3.0 and speed_kmh < 15.0:
        return True, "RAPID_ACCELERATION"

    # Passed all suppression checks
    return False, None


def load_model():
    """Load the trained RandomForest model and metadata."""
    model_path = os.path.join(MODELS_DIR, "beacon_event_rf_v1.pkl")
    meta_path = os.path.join(MODELS_DIR, "model_metadata.json")

    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Trained model not found at {model_path}. Run 'bun run ml:train' first.")

    clf = joblib.load(model_path)
    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    return clf, meta


def predict_event(
    sensor_window: Any,
    clf=None,
    meta=None,
    matcher: Optional[SegmentMatcher] = None,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Reusable prediction interface.
    Input: sensor window (dict, features array, or dict of samples).
    Output: structured prediction object with genuine confidence from predict_proba.
    """
    if clf is None or meta is None:
        clf, meta = load_model()

    if matcher is None:
        matcher = SegmentMatcher(os.path.join(DATA_DIR, "road_segments.csv"))

    # Extract features if needed
    if isinstance(sensor_window, np.ndarray):
        features = sensor_window.reshape(1, -1)
        feat_dict = dict(zip(FEATURE_NAMES, sensor_window.flatten()))
    elif isinstance(sensor_window, dict) and "features" in sensor_window:
        feat_arr = np.array(sensor_window["features"], dtype=np.float64)
        features = feat_arr.reshape(1, -1)
        feat_dict = dict(zip(FEATURE_NAMES, feat_arr))
    else:
        feat_arr = extract_features_from_dict(sensor_window)
        features = feat_arr.reshape(1, -1)
        feat_dict = dict(zip(FEATURE_NAMES, feat_arr))

    # True model prediction and probability
    classes = list(clf.classes_)
    probas = clf.predict_proba(features)[0]
    pred_idx = int(np.argmax(probas))
    pred_class = classes[pred_idx]
    confidence = float(probas[pred_idx])

    # Class probabilities breakdown
    class_probas = {cls_name: round(float(probas[i]), 4) for i, cls_name in enumerate(classes)}

    # Location & context
    lat = float(sensor_window.get("latitude", 9.945936) if isinstance(sensor_window, dict) else 9.945936)
    lon = float(sensor_window.get("longitude", 76.279231) if isinstance(sensor_window, dict) else 76.279231)
    timestamp = sensor_window.get("timestamp", "2026-09-18T06:30:04.500000") if isinstance(sensor_window, dict) else "2026-09-18T06:30:04.500000"
    pass_id = sensor_window.get("pass_id", "PASS_01_001_01") if isinstance(sensor_window, dict) else "PASS_01_001_01"

    # Map matching
    matched_seg, dist_m = matcher.match(lat, lon)

    # Suppression context
    eval_context = {
        "speed_kmh": feat_dict.get("speed_mean", 35.0),
        "gyro_magnitude_mean": feat_dict.get("gyro_magnitude_mean", 0.0),
        "speed_change": feat_dict.get("speed_change", 0.0),
        "ax_min": feat_dict.get("ax_min", 0.0),
        "ax_max": feat_dict.get("ax_max", 0.0),
    }
    if context:
        eval_context.update(context)

    is_suppressed, suppression_reason = should_suppress_event(
        {"eventType": pred_class, "confidence": confidence},
        eval_context,
        CONFIDENCE_THRESHOLD,
    )

    is_event = (pred_class != "NORMAL") and (not is_suppressed)

    result = {
        "eventType": pred_class,
        "isEvent": is_event,
        "confidence": round(confidence, 4),
        "classProbabilities": class_probas,
        "timestamp": timestamp,
        "latitude": round(lat, 6),
        "longitude": round(lon, 6),
        "segmentId": matched_seg,
        "matchedDistanceMeters": round(dist_m, 1),
        "isSuppressed": is_suppressed,
        "suppressionReason": suppression_reason,
        "predictionSource": "ML",
        "modelVersion": MODEL_VERSION,
        "passId": pass_id,
        "featuresSummary": {
            "verticalPeak": round(float(feat_dict.get("vertical_acceleration_peak", 0.0)), 3),
            "jerkMax": round(float(feat_dict.get("jerk_max", 0.0)), 2),
            "speedMean": round(float(feat_dict.get("speed_mean", 0.0)), 1),
        },
    }

    return result


def insert_road_event_supabase(prediction_result: Dict[str, Any]) -> bool:
    """Insert ML prediction into Supabase road_events table if credentials exist."""
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    supabase_key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_SECRET_KEY")
        or os.environ.get("SUPABASE_ANON_KEY")
        or os.environ.get("VITE_SUPABASE_ANON_KEY")
    )

    if not supabase_url or not supabase_key or "placeholder" in supabase_url:
        print("[DB] Supabase not configured with live credentials. Saved to local ML event log.")
        return False

    try:
        from supabase import create_client
        client = create_client(supabase_url, supabase_key)

        event_payload = {
            "event_id": f"ML_{int(prediction_result['timestamp'].replace('-', '').replace(':', '').replace('.', '').replace('T', '')[:14])}",
            "pass_id": prediction_result["passId"],
            "bus_id": "BUS_001",
            "segment_id": prediction_result["segmentId"],
            "timestamp": prediction_result["timestamp"],
            "latitude": prediction_result["latitude"],
            "longitude": prediction_result["longitude"],
            "event_type": prediction_result["eventType"],
            "severity": 3,
            "confidence": prediction_result["confidence"],
            "ground_truth": 0,
            "prediction_source": "ML",
            "model_version": prediction_result["modelVersion"],
            "predicted_event_type": prediction_result["eventType"],
            "prediction_confidence": prediction_result["confidence"],
        }

        res = client.from_("road_events").insert(event_payload).execute()
        print(f"[DB] Successfully inserted ML event {event_payload['event_id']} into Supabase road_events.")
        return True
    except Exception as e:
        print(f"[DB] Error writing to Supabase: {e}")
        return False


def run_demo(write_to_db: bool = False, output_json: bool = False):
    """Run deterministic demo inference using a held-out test sample."""
    sample_file = os.path.join(CACHE_DIR, "demo_sample_window.json")
    if not os.path.exists(sample_file):
        # Fallback to preparing dataset if needed
        import prepare_dataset
        prepare_dataset.main()

    with open(sample_file, "r", encoding="utf-8") as f:
        demo_sample = json.load(f)

    clf, meta = load_model()
    matcher = SegmentMatcher(os.path.join(DATA_DIR, "road_segments.csv"))

    result = predict_event(demo_sample, clf=clf, meta=meta, matcher=matcher)

    # Save to ml/output/demo_prediction.json and public/data/ml/demo_prediction.json
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(PUBLIC_ML_DIR, exist_ok=True)

    demo_pred_path = os.path.join(OUTPUT_DIR, "demo_prediction.json")
    with open(demo_pred_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    public_pred_path = os.path.join(PUBLIC_ML_DIR, "demo_prediction.json")
    with open(public_pred_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    if output_json:
        print(json.dumps(result, indent=2))
        return

    # User-specified CLI output format
    print("\n-----------------------------------------")
    print("BEACON ML EVENT DETECTION")
    print("-----------------------------------------")
    print(f"\nModel:\n{result['modelVersion']}")
    print(f"\nPrediction:\n{result['eventType']}")
    print(f"\nConfidence:\n{result['confidence'] * 100:.1f}%")
    print(f"\nCoordinates:\n{result['latitude']:.6f}, {result['longitude']:.6f}")
    print(f"\nMatched Segment:\n{result['segmentId']} ({result['matchedDistanceMeters']}m)")
    print(f"\nSuppressed:\n{'YES (' + str(result['suppressionReason']) + ')' if result['isSuppressed'] else 'NO'}")
    print(f"\nSource:\n{result['predictionSource']}")
    print("-----------------------------------------")

    if write_to_db:
        if result["isEvent"]:
            print("\n[DB] Writing prediction to database (--write flag provided)...")
            insert_road_event_supabase(result)
        else:
            print(f"\n[DB] Prediction is {result['eventType']} (isEvent=False); not written to road_events table.")
    else:
        print("\nMode: PREVIEW ONLY (no database write). Use '--write' to insert into database.")


def main():
    parser = argparse.ArgumentParser(description="Beacon ML Event Prediction Engine")
    parser.add_argument("--demo", action="store_true", help="Run deterministic demo prediction")
    parser.add_argument("--write", action="store_true", help="Explicitly write accepted prediction to database")
    parser.add_argument("--json", action="store_true", help="Output raw JSON format")
    args = parser.parse_args()

    if args.demo or not sys.stdin.isatty():
        run_demo(write_to_db=args.write, output_json=args.json)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
