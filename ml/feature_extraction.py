"""
Beacon ML - Feature Extraction Module
Extracts 34 explainable numerical kinematic and statistical features from 5-second sensor windows (50 samples at 10 Hz).
"""

from typing import Dict, List, Union, Any
import numpy as np

# Canonical list of all 34 feature names in exact column order
FEATURE_NAMES: List[str] = [
    # Accelerometer (19 features)
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
    # Gyroscope (8 features)
    "gx_mean",
    "gy_mean",
    "gz_mean",
    "gx_std",
    "gy_std",
    "gz_std",
    "gyro_magnitude_mean",
    "gyro_magnitude_std",
    # Vehicle Speed (5 features)
    "speed_mean",
    "speed_std",
    "speed_min",
    "speed_max",
    "speed_change",
    # Temporal (2 features)
    "window_duration",
    "sample_count",
]

GRAVITY_MS2 = 9.80665


def clean_array(arr: np.ndarray, default_val: float = 0.0) -> np.ndarray:
    """Replace NaN, -Inf, and +Inf with default_val."""
    if arr.size == 0:
        return arr
    arr = np.nan_to_num(arr, nan=default_val, posinf=default_val, neginf=default_val)
    return arr


def safe_stat(arr: np.ndarray, fn, default_val: float = 0.0) -> float:
    """Safely calculate a statistical reduction on an array."""
    if arr.size == 0:
        return default_val
    try:
        val = float(fn(arr))
        if np.isnan(val) or np.isinf(val):
            return default_val
        return val
    except Exception:
        return default_val


def extract_features_from_arrays(
    accel_x: np.ndarray,
    accel_y: np.ndarray,
    accel_z: np.ndarray,
    gyro_x: np.ndarray,
    gyro_y: np.ndarray,
    gyro_z: np.ndarray,
    speed: np.ndarray,
    timestamps: Union[np.ndarray, None] = None,
    dt: float = 0.1,
) -> Dict[str, float]:
    """
    Extract all 34 features from synchronized numpy arrays.
    """
    # Clean arrays
    ax = clean_array(np.asarray(accel_x, dtype=np.float64), 0.0)
    ay = clean_array(np.asarray(accel_y, dtype=np.float64), 0.0)
    az = clean_array(np.asarray(accel_z, dtype=np.float64), GRAVITY_MS2)
    gx = clean_array(np.asarray(gyro_x, dtype=np.float64), 0.0)
    gy = clean_array(np.asarray(gyro_y, dtype=np.float64), 0.0)
    gz = clean_array(np.asarray(gyro_z, dtype=np.float64), 0.0)
    spd = clean_array(np.asarray(speed, dtype=np.float64), 0.0)

    n_samples = len(ax)
    if n_samples == 0:
        return {name: 0.0 for name in FEATURE_NAMES}

    # Accel magnitude
    accel_mag = np.sqrt(ax**2 + ay**2 + az**2)

    # Jerk (derivative of vertical acceleration az: d(az)/dt)
    if n_samples > 1:
        jerk = np.diff(az) / dt
    else:
        jerk = np.array([0.0])

    # Vertical acceleration peak: max deviation from nominal gravity
    vert_peak = safe_stat(np.abs(az - GRAVITY_MS2), np.max, 0.0)

    # Gyro magnitude
    gyro_mag = np.sqrt(gx**2 + gy**2 + gz**2)

    # Speed metrics
    speed_mean = safe_stat(spd, np.mean, 0.0)
    speed_std = safe_stat(spd, np.std, 0.0)
    speed_min = safe_stat(spd, np.min, 0.0)
    speed_max = safe_stat(spd, np.max, 0.0)
    speed_change = float(spd[-1] - spd[0]) if n_samples > 0 else 0.0

    # Window duration
    if timestamps is not None and len(timestamps) > 1:
        try:
            # If string timestamps or datetime
            dur = float(n_samples * dt)
        except Exception:
            dur = float(n_samples * dt)
    else:
        dur = float(n_samples * dt)

    features = {
        # Accelerometer
        "ax_mean": safe_stat(ax, np.mean, 0.0),
        "ay_mean": safe_stat(ay, np.mean, 0.0),
        "az_mean": safe_stat(az, np.mean, GRAVITY_MS2),
        "ax_std": safe_stat(ax, np.std, 0.0),
        "ay_std": safe_stat(ay, np.std, 0.0),
        "az_std": safe_stat(az, np.std, 0.0),
        "ax_min": safe_stat(ax, np.min, 0.0),
        "ay_min": safe_stat(ay, np.min, 0.0),
        "az_min": safe_stat(az, np.min, GRAVITY_MS2),
        "ax_max": safe_stat(ax, np.max, 0.0),
        "ay_max": safe_stat(ay, np.max, 0.0),
        "az_max": safe_stat(az, np.max, GRAVITY_MS2),
        "accel_magnitude_mean": safe_stat(accel_mag, np.mean, GRAVITY_MS2),
        "accel_magnitude_std": safe_stat(accel_mag, np.std, 0.0),
        "accel_magnitude_max": safe_stat(accel_mag, np.max, GRAVITY_MS2),
        "jerk_mean": safe_stat(jerk, np.mean, 0.0),
        "jerk_std": safe_stat(jerk, np.std, 0.0),
        "jerk_max": safe_stat(np.abs(jerk), np.max, 0.0),
        "vertical_acceleration_peak": vert_peak,
        # Gyroscope
        "gx_mean": safe_stat(gx, np.mean, 0.0),
        "gy_mean": safe_stat(gy, np.mean, 0.0),
        "gz_mean": safe_stat(gz, np.mean, 0.0),
        "gx_std": safe_stat(gx, np.std, 0.0),
        "gy_std": safe_stat(gy, np.std, 0.0),
        "gz_std": safe_stat(gz, np.std, 0.0),
        "gyro_magnitude_mean": safe_stat(gyro_mag, np.mean, 0.0),
        "gyro_magnitude_std": safe_stat(gyro_mag, np.std, 0.0),
        # Vehicle Speed
        "speed_mean": speed_mean,
        "speed_std": speed_std,
        "speed_min": speed_min,
        "speed_max": speed_max,
        "speed_change": speed_change,
        # Temporal
        "window_duration": dur,
        "sample_count": float(n_samples),
    }

    return features


def extract_features_vector(
    accel_x: np.ndarray,
    accel_y: np.ndarray,
    accel_z: np.ndarray,
    gyro_x: np.ndarray,
    gyro_y: np.ndarray,
    gyro_z: np.ndarray,
    speed: np.ndarray,
    timestamps: Union[np.ndarray, None] = None,
    dt: float = 0.1,
) -> np.ndarray:
    """Extract features and return as 1D numpy array in standard FEATURE_NAMES order."""
    feat_dict = extract_features_from_arrays(
        accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z, speed, timestamps, dt
    )
    return np.array([feat_dict[k] for k in FEATURE_NAMES], dtype=np.float64)


def extract_features_from_dict(sample_dict: Dict[str, Any]) -> np.ndarray:
    """
    Extract features from a window representation that can be a list of records or dict of lists.
    Compatible with JSON payload or DataFrame columns.
    """
    if "samples" in sample_dict:
        samples = sample_dict["samples"]
        ax = np.array([s.get("accel_x", 0.0) for s in samples], dtype=np.float64)
        ay = np.array([s.get("accel_y", 0.0) for s in samples], dtype=np.float64)
        az = np.array([s.get("accel_z", GRAVITY_MS2) for s in samples], dtype=np.float64)
        gx = np.array([s.get("gyro_x", 0.0) for s in samples], dtype=np.float64)
        gy = np.array([s.get("gyro_y", 0.0) for s in samples], dtype=np.float64)
        gz = np.array([s.get("gyro_z", 0.0) for s in samples], dtype=np.float64)
        spd = np.array([s.get("speed_kmh", s.get("speed", 0.0)) for s in samples], dtype=np.float64)
        return extract_features_vector(ax, ay, az, gx, gy, gz, spd)

    # Column-oriented dict
    ax = np.array(sample_dict.get("accel_x", []), dtype=np.float64)
    ay = np.array(sample_dict.get("accel_y", []), dtype=np.float64)
    az = np.array(sample_dict.get("accel_z", []), dtype=np.float64)
    gx = np.array(sample_dict.get("gyro_x", []), dtype=np.float64)
    gy = np.array(sample_dict.get("gyro_y", []), dtype=np.float64)
    gz = np.array(sample_dict.get("gyro_z", []), dtype=np.float64)
    spd = np.array(sample_dict.get("speed_kmh", sample_dict.get("speed", [])), dtype=np.float64)
    return extract_features_vector(ax, ay, az, gx, gy, gz, spd)
