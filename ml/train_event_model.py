"""
Beacon ML - Train Event Model
Trains a balanced RandomForestClassifier on extracted 34-feature windows.
Outputs beacon_event_rf_v1.pkl and model_metadata.json.
"""

import os
import json
import time
from datetime import datetime, timezone
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score
from feature_extraction import FEATURE_NAMES

CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
PUBLIC_ML_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data", "ml")

MODEL_VERSION = "beacon-event-rf-v1"
CANONICAL_CLASSES = ["NORMAL", "POTHOLE", "SPEED_BREAKER", "BROKEN_PATCH", "ROUGHNESS"]


def main():
    os.makedirs(MODELS_DIR, exist_ok=True)
    os.makedirs(PUBLIC_ML_DIR, exist_ok=True)

    print(f"Loading cached dataset from {CACHE_DIR}...")
    X_train = np.load(os.path.join(CACHE_DIR, "X_train.npy"))
    y_train = np.load(os.path.join(CACHE_DIR, "y_train.npy"))
    X_test = np.load(os.path.join(CACHE_DIR, "X_test.npy"))
    y_test = np.load(os.path.join(CACHE_DIR, "y_test.npy"))

    with open(os.path.join(CACHE_DIR, "dataset_metadata.json"), "r", encoding="utf-8") as f:
        ds_meta = json.load(f)

    print(f"Training set: {X_train.shape[0]} windows, {X_train.shape[1]} features.")
    print(f"Test set    : {X_test.shape[0]} windows.")

    # Instantiate RandomForestClassifier
    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=16,
        min_samples_split=4,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
        verbose=0,
    )

    print(f"\nTraining RandomForestClassifier ({MODEL_VERSION})...")
    t0 = time.time()
    clf.fit(X_train, y_train)
    train_time = round(time.time() - t0, 2)
    print(f"Model training completed in {train_time} seconds.")

    # Preliminary validation check
    y_pred_train = clf.predict(X_train)
    y_pred_test = clf.predict(X_test)

    train_acc = float(accuracy_score(y_train, y_pred_train))
    test_acc = float(accuracy_score(y_test, y_pred_test))
    test_macro_f1 = float(f1_score(y_test, y_pred_test, average="macro"))
    test_weighted_f1 = float(f1_score(y_test, y_pred_test, average="weighted"))

    print(f"Train Accuracy: {train_acc:.4f}")
    print(f"Test Accuracy : {test_acc:.4f}")
    print(f"Test Macro F1 : {test_macro_f1:.4f}")
    print(f"Test Weight F1: {test_weighted_f1:.4f}")

    # Top feature importances
    importances = clf.feature_importances_
    top_indices = np.argsort(importances)[::-1][:10]
    print("\nTop 10 Most Predictive Features:")
    for rank, idx in enumerate(top_indices, 1):
        print(f"  {rank:2d}. {FEATURE_NAMES[idx]:28s}: {importances[idx]:.4f}")

    # Save model binary
    model_path = os.path.join(MODELS_DIR, f"{MODEL_VERSION.replace('-', '_')}.pkl")
    # Also save standard name beacon_event_rf_v1.pkl
    canonical_model_path = os.path.join(MODELS_DIR, "beacon_event_rf_v1.pkl")
    joblib.dump(clf, canonical_model_path)
    if model_path != canonical_model_path:
        joblib.dump(clf, model_path)
    print(f"\nSaved model binary to {canonical_model_path}")

    # Prepare model metadata
    model_metadata = {
        "model_version": MODEL_VERSION,
        "model_type": "RandomForestClassifier",
        "parameters": {
            "n_estimators": 200,
            "max_depth": 16,
            "min_samples_split": 4,
            "min_samples_leaf": 2,
            "class_weight": "balanced",
            "random_state": 42,
        },
        "classes": list(clf.classes_),
        "feature_count": len(FEATURE_NAMES),
        "feature_names": FEATURE_NAMES,
        "training_samples": int(X_train.shape[0]),
        "test_samples": int(X_test.shape[0]),
        "train_passes": ds_meta["train_passes_count"],
        "test_passes": ds_meta["test_passes_count"],
        "accuracy": test_acc,
        "macro_f1": test_macro_f1,
        "weighted_f1": test_weighted_f1,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset": "synthetic",
        "dataset_disclaimer": "Trained and evaluated using synthetic/demo sensor telemetry. Evaluation metrics do not represent real-world KSRTC detection accuracy.",
    }

    meta_path = os.path.join(MODELS_DIR, "model_metadata.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(model_metadata, f, indent=2)

    # Copy metadata to public directory for static consumption by web application
    public_meta_path = os.path.join(PUBLIC_ML_DIR, "model_metadata.json")
    with open(public_meta_path, "w", encoding="utf-8") as f:
        json.dump(model_metadata, f, indent=2)

    print(f"Saved model metadata to {meta_path} and {public_meta_path}")


if __name__ == "__main__":
    main()
