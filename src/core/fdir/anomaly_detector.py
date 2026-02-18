import numpy as np
from collections import deque
from sklearn.ensemble import IsolationForest


class AnomalyDetector:
    WINDOW_SIZE = 300
    MIN_SAMPLES = 60

    def __init__(self):
        self.buffer = deque(maxlen=self.WINDOW_SIZE)
        self.model = None
        self.frames_since_retrain = 0

    def add_frame(self, frame: dict) -> bool:
        features = self._extract_features(frame)
        self.buffer.append(features)
        self.frames_since_retrain += 1

        if len(self.buffer) < self.MIN_SAMPLES:
            return False

        if self.model is None or self.frames_since_retrain >= self.WINDOW_SIZE:
            self._retrain()

        prediction = self.model.predict([features])
        return prediction[0] == -1

    def _extract_features(self, frame: dict) -> list:
        return [
            frame.get("battery_pct", 100),
            frame.get("storage_pct", 0),
            frame.get("altitude_km", 600),
            frame.get("speed_km_s", 7.5),
            frame.get("temperature_c", 25),
        ]

    def _retrain(self):
        X = np.array(list(self.buffer))
        self.model = IsolationForest(
            contamination=0.05,
            random_state=42,
            n_estimators=100,
        )
        self.model.fit(X)
        self.frames_since_retrain = 0

    def is_trained(self) -> bool:
        return self.model is not None

    def reset(self):
        self.buffer.clear()
        self.model = None
        self.frames_since_retrain = 0
