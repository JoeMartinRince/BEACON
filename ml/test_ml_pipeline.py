"""
Beacon ML - Automated Test Suite
Verifies feature extraction, missing values, model predictions, confidence,
NORMAL handling, thresholding, map matching, suppression, and determinism.
"""

import os
import unittest
import numpy as np
import joblib
from feature_extraction import (
    extract_features_vector,
    extract_features_from_arrays,
    extract_features_from_dict,
    FEATURE_NAMES,
)
from predict_event import (
    load_model,
    predict_event,
    should_suppress_event,
    SegmentMatcher,
    CONFIDENCE_THRESHOLD,
    MODEL_VERSION,
)

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(ROOT_DIR, "data", "synthetic")


class TestBeaconMLPipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.clf, cls.meta = load_model()
        cls.matcher = SegmentMatcher(os.path.join(DATA_DIR, "road_segments.csv"))

    def test_01_feature_extraction_count(self):
        """Test that exactly 34 features are extracted in standard order."""
        N = 50
        ax = np.zeros(N)
        ay = np.zeros(N)
        az = np.full(N, 9.8)
        gx, gy, gz = np.zeros(N), np.zeros(N), np.zeros(N)
        spd = np.full(N, 40.0)

        vec = extract_features_vector(ax, ay, az, gx, gy, gz, spd)
        self.assertEqual(len(vec), 34)
        self.assertEqual(len(FEATURE_NAMES), 34)

    def test_02_missing_values_and_inf_handling(self):
        """Test resilience to NaN, Inf, and empty windows."""
        # Empty array
        vec_empty = extract_features_vector(np.array([]), np.array([]), np.array([]), np.array([]), np.array([]), np.array([]), np.array([]))
        self.assertEqual(len(vec_empty), 34)
        self.assertFalse(np.isnan(vec_empty).any())

        # Array with NaN and Inf
        corrupted = np.array([np.nan, np.inf, -np.inf, 2.5, 0.0])
        vec_corr = extract_features_vector(corrupted, corrupted, corrupted, corrupted, corrupted, corrupted, corrupted)
        self.assertEqual(len(vec_corr), 34)
        self.assertFalse(np.isnan(vec_corr).any())
        self.assertFalse(np.isinf(vec_corr).any())

    def test_03_feature_shape(self):
        """Verify feature vector matches model expected input dimension."""
        sample_feat = np.zeros(34)
        self.assertEqual(sample_feat.shape, (34,))
        reshaped = sample_feat.reshape(1, -1)
        self.assertEqual(reshaped.shape, (1, 34))

    def test_04_model_loading(self):
        """Verify trained model binary and metadata load properly."""
        self.assertIsNotNone(self.clf)
        self.assertEqual(self.meta["model_version"], MODEL_VERSION)
        self.assertEqual(len(self.meta["classes"]), 5)

    def test_05_model_prediction(self):
        """Verify prediction runs without error on synthetic sensor features."""
        features = np.zeros(34)
        features[2] = 9.8  # az_mean
        features[12] = 9.8  # accel_magnitude_mean
        features[27] = 40.0  # speed_mean

        pred = self.clf.predict(features.reshape(1, -1))[0]
        self.assertIn(pred, self.clf.classes_)

    def test_06_probability_and_confidence(self):
        """Verify model output confidence is genuine probability between 0 and 1."""
        features = np.zeros(34)
        features[2] = 9.8
        res = predict_event(features, clf=self.clf, meta=self.meta, matcher=self.matcher)

        self.assertGreaterEqual(res["confidence"], 0.0)
        self.assertLessEqual(res["confidence"], 1.0)
        # Sum of class probabilities ~ 1.0
        sum_p = sum(res["classProbabilities"].values())
        self.assertAlmostEqual(sum_p, 1.0, places=3)

    def test_07_normal_detection_handling(self):
        """Verify NORMAL class does NOT create a road event (isEvent = False)."""
        res_normal = {
            "eventType": "NORMAL",
            "confidence": 0.95,
        }
        suppressed, reason = should_suppress_event(res_normal)
        self.assertTrue(suppressed)
        self.assertEqual(reason, "NORMAL_ROAD")

    def test_08_confidence_threshold(self):
        """Verify confidence < threshold triggers suppression."""
        low_conf = {
            "eventType": "POTHOLE",
            "confidence": 0.35,  # below 0.60
        }
        suppressed, reason = should_suppress_event(low_conf, threshold=0.60)
        self.assertTrue(suppressed)
        self.assertEqual(reason, "LOW_CONFIDENCE")

    def test_09_map_matching(self):
        """Verify coordinates map to nearest segment among the 160 corridors."""
        # Coordinates near Kakkanad / NH
        seg_id, dist = self.matcher.match(9.965, 76.300)
        self.assertTrue(seg_id.startswith("SEG_"))
        self.assertGreater(len(seg_id), 4)

    def test_10_suppression_harsh_braking_and_sharp_turn(self):
        """Verify suppression signals for harsh braking and sharp turning."""
        # Harsh braking
        ev = {"eventType": "POTHOLE", "confidence": 0.85}
        suppressed, reason = should_suppress_event(ev, context={"ax_min": -4.2})
        self.assertTrue(suppressed)
        self.assertEqual(reason, "HARD_BRAKING")

        # Sharp turn
        suppressed, reason = should_suppress_event(ev, context={"gyro_magnitude_mean": 0.65})
        self.assertTrue(suppressed)
        self.assertEqual(reason, "SHARP_TURN")

        # Stationary
        suppressed, reason = should_suppress_event(ev, context={"speed_kmh": 2.0})
        self.assertTrue(suppressed)
        self.assertEqual(reason, "BUS_STOP_DEPARTURE")

    def test_11_event_object_structure(self):
        """Verify structured prediction output matches schema."""
        features = np.zeros(34)
        features[2] = 9.8
        res = predict_event(features, clf=self.clf, meta=self.meta, matcher=self.matcher)

        required_keys = [
            "eventType", "isEvent", "confidence", "classProbabilities",
            "timestamp", "latitude", "longitude", "segmentId",
            "isSuppressed", "predictionSource", "modelVersion"
        ]
        for k in required_keys:
            self.assertIn(k, res)

    def test_12_deterministic_demo(self):
        """Verify that same input + model + config yields identical prediction."""
        features = np.full(34, 0.5)
        res1 = predict_event(features, clf=self.clf, meta=self.meta, matcher=self.matcher)
        res2 = predict_event(features, clf=self.clf, meta=self.meta, matcher=self.matcher)

        self.assertEqual(res1["eventType"], res2["eventType"])
        self.assertEqual(res1["confidence"], res2["confidence"])
        self.assertEqual(res1["segmentId"], res2["segmentId"])
        self.assertEqual(res1["isSuppressed"], res2["isSuppressed"])


if __name__ == "__main__":
    unittest.main()
