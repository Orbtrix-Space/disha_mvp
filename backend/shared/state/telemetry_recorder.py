"""
Telemetry Recorder — auto-saves every synthetic telemetry frame to CSV + optional JSON.
"""

import csv
import json
import os
from datetime import datetime, timezone
from threading import Lock

# Flat CSV columns extracted from the telemetry frame
CSV_COLUMNS = [
    "timestamp",
    "source",
    # Position
    "latitude",
    "longitude",
    "altitude_km",
    # Velocity
    "speed_km_s",
    "vx",
    "vy",
    "vz",
    # Power
    "battery_pct",
    "battery_wh",
    "bus_voltage",
    "solar_panel_current_a",
    "in_eclipse",
    # Thermal
    "panel_temp_c",
    "battery_temp_c",
    # Comms
    "link_status",
    "snr_db",
    "data_rate",
    "nearest_station",
    # Attitude
    "attitude_mode",
    "pointing_error",
    "angular_rate",
    # Storage
    "storage_used_gb",
    "storage_pct",
    # Contact
    "in_contact",
    "contact_station",
    "contact_elevation_deg",
    "blackout_duration_sec",
    # Alerts
    "alert_count",
]


def _flatten_frame(frame: dict, source: str, alerts: list | None) -> dict:
    """Extract flat CSV row from a telemetry frame dict."""
    return {
        "timestamp": frame.get("timestamp", ""),
        "source": source,
        "latitude": frame.get("latitude", 0.0),
        "longitude": frame.get("longitude", 0.0),
        "altitude_km": frame.get("altitude_km", 0.0),
        "speed_km_s": frame.get("speed_km_s", 0.0),
        "vx": frame.get("velocity", {}).get("vx", 0.0),
        "vy": frame.get("velocity", {}).get("vy", 0.0),
        "vz": frame.get("velocity", {}).get("vz", 0.0),
        "battery_pct": frame.get("battery_pct", 0.0),
        "battery_wh": frame.get("battery_wh", 0.0),
        "bus_voltage": frame.get("bus_voltage", 0.0),
        "solar_panel_current_a": frame.get("solar_panel_current_a", 0.0),
        "in_eclipse": frame.get("in_eclipse", False),
        "panel_temp_c": frame.get("panel_temp_c", 0.0),
        "battery_temp_c": frame.get("battery_temp_c", 0.0),
        "link_status": frame.get("link_status", ""),
        "snr_db": frame.get("snr_db", 0.0),
        "data_rate": frame.get("comms", {}).get("data_rate", 0.0),
        "nearest_station": frame.get("comms", {}).get("nearest_station", ""),
        "attitude_mode": frame.get("attitude_mode", ""),
        "pointing_error": frame.get("pointing_error", 0.0),
        "angular_rate": frame.get("angular_rate", 0.0),
        "storage_used_gb": frame.get("storage_used_gb", 0.0),
        "storage_pct": frame.get("storage_pct", 0.0),
        "in_contact": frame.get("in_contact", False),
        "contact_station": frame.get("contact_station", ""),
        "contact_elevation_deg": frame.get("contact_elevation_deg", 0.0),
        "blackout_duration_sec": frame.get("blackout_duration_sec", 0.0),
        "alert_count": len(alerts) if alerts else 0,
    }


class TelemetryRecorder:
    """Auto-records every telemetry frame to a CSV file. Also supports JSON snapshots."""

    def __init__(self, output_dir: str = "telemetry_logs"):
        self.output_dir = output_dir
        self._lock = Lock()
        self._frame_count = 0
        self._json_frames: list[dict] = []
        self._json_recording = False
        self._json_start_time: str | None = None
        os.makedirs(output_dir, exist_ok=True)

        # Auto-start CSV on init
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        self._csv_path = os.path.join(output_dir, f"telemetry_{ts}.csv")
        self._csv_file = open(self._csv_path, "w", newline="")
        self._csv_writer = csv.DictWriter(self._csv_file, fieldnames=CSV_COLUMNS)
        self._csv_writer.writeheader()
        self._csv_file.flush()
        print(f"[RECORDER] CSV auto-recording to {self._csv_path}")

    def record(self, frame: dict, source: str, alerts: list | None = None):
        """Record a single telemetry frame — always writes to CSV, optionally to JSON buffer."""
        row = _flatten_frame(frame, source, alerts)
        with self._lock:
            # Always write to CSV
            self._csv_writer.writerow(row)
            self._frame_count += 1
            # Flush every 60 frames (~1 min) to avoid data loss
            if self._frame_count % 60 == 0:
                self._csv_file.flush()

            # Optional JSON recording
            if self._json_recording:
                self._json_frames.append({
                    "source": source,
                    "alerts": alerts or [],
                    "frame": frame,
                })

    # --- JSON snapshot (manual start/stop) ---

    def start_json(self):
        """Start buffering frames for a JSON snapshot."""
        with self._lock:
            self._json_frames.clear()
            self._json_recording = True
            self._json_start_time = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    def stop_json(self) -> str | None:
        """Stop JSON recording and flush to file. Returns the file path."""
        with self._lock:
            self._json_recording = False
            if not self._json_frames:
                return None
            filename = f"telemetry_{self._json_start_time}_{len(self._json_frames)}frames.json"
            path = os.path.join(self.output_dir, filename)
            with open(path, "w") as f:
                json.dump({
                    "recorded_at": self._json_start_time,
                    "total_frames": len(self._json_frames),
                    "frames": self._json_frames,
                }, f, indent=2, default=str)
            count = len(self._json_frames)
            self._json_frames.clear()
            print(f"[RECORDER] JSON saved {count} frames -> {path}")
            return path

    def status(self) -> dict:
        return {
            "csv_file": self._csv_path,
            "csv_frames": self._frame_count,
            "json_recording": self._json_recording,
            "json_buffered_frames": len(self._json_frames),
        }
