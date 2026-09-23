"""
Beacon ML - Model Evaluation
Evaluates beacon-event-rf-v1 on the test set (held-out passes).
Generates classification_report.txt, metrics.json, and confusion_matrix.png.
"""

import os
import json
import numpy as np
import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    accuracy_score,
    precision_recall_fscore_support,
)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
PUBLIC_ML_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data", "ml")

MODEL_VERSION = "beacon-event-rf-v1"


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(PUBLIC_ML_DIR, exist_ok=True)

    print("Loading test dataset and trained model...")
    X_test = np.load(os.path.join(CACHE_DIR, "X_test.npy"))
    y_test = np.load(os.path.join(CACHE_DIR, "y_test.npy"))
    groups_test = np.load(os.path.join(CACHE_DIR, "groups_test.npy"))

    model_path = os.path.join(MODELS_DIR, "beacon_event_rf_v1.pkl")
    clf = joblib.load(model_path)
    classes = list(clf.classes_)

    print(f"Running inference on {len(X_test)} test windows across {len(set(groups_test))} held-out passes...")
    y_pred = clf.predict(X_test)
    y_proba = clf.predict_proba(X_test)

    # Calculate overall metrics
    acc = float(accuracy_score(y_test, y_pred))
    macro_p, macro_r, macro_f1, _ = precision_recall_fscore_support(y_test, y_pred, average="macro", zero_division=0)
    weighted_p, weighted_r, weighted_f1, _ = precision_recall_fscore_support(y_test, y_pred, average="weighted", zero_division=0)

    # Per-class metrics
    per_class_p, per_class_r, per_class_f1, per_class_support = precision_recall_fscore_support(
        y_test, y_pred, labels=classes, zero_division=0
    )

    per_class_metrics = {}
    for i, cls_name in enumerate(classes):
        per_class_metrics[cls_name] = {
            "precision": round(float(per_class_p[i]), 4),
            "recall": round(float(per_class_r[i]), 4),
            "f1": round(float(per_class_f1[i]), 4),
            "support": int(per_class_support[i]),
        }

    # Confusion matrix
    cm = confusion_matrix(y_test, y_pred, labels=classes)

    print("\n==========================================")
    print("BEACON ML - EVALUATION RESULTS")
    print("==========================================")
    print(f"Model Version: {MODEL_VERSION}")
    print(f"Test Samples : {len(X_test)}")
    print(f"Test Passes  : {len(set(groups_test))}")
    print(f"Accuracy     : {acc:.4f}")
    print(f"Macro Precision: {macro_p:.4f}")
    print(f"Macro Recall   : {macro_r:.4f}")
    print(f"Macro F1       : {macro_f1:.4f}")
    print(f"Weighted F1    : {weighted_f1:.4f}")

    print("\nPer-Class Breakdown:")
    for cls_name, m in per_class_metrics.items():
        print(f"  {cls_name:15s} P: {m['precision']:.3f} | R: {m['recall']:.3f} | F1: {m['f1']:.3f} (N={m['support']})")

    # 1. Text Classification Report
    report_text = classification_report(y_test, y_pred, labels=classes, digits=4)
    report_path = os.path.join(OUTPUT_DIR, "classification_report.txt")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(f"BEACON ML EVALUATION REPORT\nModel: {MODEL_VERSION}\nTest Samples: {len(X_test)}\n\n")
        f.write(report_text)
        f.write("\n\nConfusion Matrix (rows: true, cols: pred):\n")
        f.write("Labels: " + ", ".join(classes) + "\n")
        f.write(str(cm) + "\n")
        f.write("\nNote: Evaluated on synthetic demonstration dataset.\n")

    # 2. JSON Metrics
    metrics_data = {
        "model_version": MODEL_VERSION,
        "test_samples": len(X_test),
        "test_passes_count": len(set(groups_test)),
        "accuracy": round(acc, 4),
        "macro_precision": round(float(macro_p), 4),
        "macro_recall": round(float(macro_r), 4),
        "macro_f1": round(float(macro_f1), 4),
        "weighted_f1": round(float(weighted_f1), 4),
        "classes": classes,
        "per_class": per_class_metrics,
        "confusion_matrix": cm.tolist(),
        "disclaimer": "Synthetic dataset used for prototype demonstration. Metrics do not represent real-world KSRTC detection accuracy.",
    }

    metrics_path = os.path.join(OUTPUT_DIR, "metrics.json")
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics_data, f, indent=2)

    public_metrics_path = os.path.join(PUBLIC_ML_DIR, "metrics.json")
    with open(public_metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics_data, f, indent=2)

    # 3. Plot Confusion Matrix
    fig, ax = plt.subplots(figsize=(8, 6.5))
    cax = ax.matshow(cm, cmap="Blues", alpha=0.85)

    for i in range(len(classes)):
        for j in range(len(classes)):
            val = cm[i, j]
            color = "white" if val > cm.max() / 2 else "black"
            ax.text(j, i, f"{val}", ha="center", va="center", color=color, fontsize=12, fontweight="bold")

    fig.colorbar(cax, fraction=0.046, pad=0.04)
    ax.set_xticks(range(len(classes)))
    ax.set_yticks(range(len(classes)))
    ax.set_xticklabels([c.replace("_", "\n") for c in classes], fontsize=9)
    ax.set_yticklabels([c.replace("_", " ") for c in classes], fontsize=10)

    ax.set_xlabel("Predicted Label", fontsize=11, fontweight="bold", labelpad=10)
    ax.set_ylabel("True Ground-Truth Label", fontsize=11, fontweight="bold", labelpad=10)
    ax.set_title(f"Beacon ML ({MODEL_VERSION}) Confusion Matrix\nMacro F1: {macro_f1:.3f} | Accuracy: {acc:.3f}", fontsize=12, fontweight="bold", pad=20)
    plt.tight_layout()

    cm_path = os.path.join(OUTPUT_DIR, "confusion_matrix.png")
    fig.savefig(cm_path, dpi=200)
    plt.close(fig)

    public_cm_path = os.path.join(PUBLIC_ML_DIR, "confusion_matrix.png")
    # Also copy to public directory for static view in frontend if desired
    import shutil
    shutil.copyfile(cm_path, public_cm_path)

    print(f"\nArtifacts generated:")
    print(f"  Report: {report_path}")
    print(f"  Metrics: {metrics_path}")
    print(f"  Confusion Matrix: {cm_path}")


if __name__ == "__main__":
    main()
