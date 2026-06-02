"""
DISHA Beta — LSTM Autoencoder Trainer

Trains the small LSTM autoencoder used by AIMonitor on the nominal
telemetry dataset produced by generate_training_data.py. Saves:

    backend/fdir/ai_weights/model.pt        # state_dict
    backend/fdir/ai_weights/scaler.pkl      # {mean, std}
    backend/fdir/ai_weights/features.json   # feature list +
                                            # per-feature recon-error
                                            # mean/std (calibration)

Architecture (kept small so "small models work" is defensible):
    Encoder  : LSTM(input=F, hidden=24, layers=1) -> last hidden
    Bottleneck: Linear(24 -> 8)
    Decoder  : Linear(8 -> 24) -> repeat across T -> LSTM(input=24,
               hidden=24, layers=1) -> Linear(24 -> F)

Total params end up around 8.5K for F=8, T=60 — well under the 100K
constraint. Param count is printed at training time and at load time.

Training:
    MSE, Adam(lr=1e-3), batch=64, epochs=50, early-stop patience=5
    on a 10% held-out validation split. Best validation checkpoint
    is saved, not the final epoch.
"""

from __future__ import annotations

import argparse
import json
import pickle
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

WEIGHTS_DIR = ROOT / "backend" / "core" / "ai_weights"
DATA_PATH = ROOT / "training_data" / "nominal_telemetry.npz"


# ─── Model ────────────────────────────────────────────────────────────

class LSTMAutoencoder(nn.Module):
    """Tiny LSTM autoencoder for sequence-level reconstruction."""

    def __init__(self, n_features: int, hidden: int = 24,
                 bottleneck: int = 8, seq_len: int = 60):
        super().__init__()
        self.n_features = n_features
        self.hidden = hidden
        self.bottleneck = bottleneck
        self.seq_len = seq_len

        self.encoder = nn.LSTM(
            input_size=n_features, hidden_size=hidden,
            num_layers=1, batch_first=True,
        )
        self.to_bottleneck = nn.Linear(hidden, bottleneck)
        self.from_bottleneck = nn.Linear(bottleneck, hidden)
        self.decoder = nn.LSTM(
            input_size=hidden, hidden_size=hidden,
            num_layers=1, batch_first=True,
        )
        self.output = nn.Linear(hidden, n_features)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, T, F)
        _, (h_n, _) = self.encoder(x)  # h_n: (1, B, hidden)
        h = h_n.squeeze(0)              # (B, hidden)
        z = self.to_bottleneck(h)       # (B, bottleneck)
        d = self.from_bottleneck(z)     # (B, hidden)
        # Repeat bottleneck-derived hidden across the sequence
        d_seq = d.unsqueeze(1).expand(-1, x.size(1), -1)  # (B, T, hidden)
        out, _ = self.decoder(d_seq)    # (B, T, hidden)
        return self.output(out)         # (B, T, F)


def count_params(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


# ─── Data ─────────────────────────────────────────────────────────────

def load_dataset(path: Path):
    if not path.exists():
        sys.exit(f"Dataset not found: {path}\nRun generate_training_data.py first.")
    npz = np.load(path, allow_pickle=False)
    return npz["data"].astype(np.float32), [str(f) for f in npz["features"]]


def fit_scaler(data: np.ndarray):
    """Standard scaler with std floor to avoid divide-by-zero on
    constant-value features (e.g. storage_pct in nominal runs)."""
    mean = data.mean(axis=0)
    std = data.std(axis=0)
    std_floor = np.maximum(std, 1e-3)
    return {"mean": mean.astype(np.float32), "std": std_floor.astype(np.float32)}


def make_sequences(data_2d: np.ndarray, seq_len: int) -> np.ndarray:
    """Sliding-window sequences. Returns (N - seq_len + 1, seq_len, F)."""
    n = data_2d.shape[0] - seq_len + 1
    # Memory-efficient stride trick
    return np.lib.stride_tricks.sliding_window_view(
        data_2d, window_shape=(seq_len, data_2d.shape[1])
    ).reshape(n, seq_len, data_2d.shape[1])


# ─── Training ─────────────────────────────────────────────────────────

def train(
    data_path: Path = DATA_PATH,
    out_dir: Path = WEIGHTS_DIR,
    seq_len: int = 60,
    hidden: int = 24,
    bottleneck: int = 8,
    epochs: int = 50,
    batch_size: int = 64,
    lr: float = 1e-3,
    patience: int = 5,
    val_split: float = 0.1,
    seed: int = 42,
    seq_subsample: int = 8,
):
    torch.manual_seed(seed)
    np.random.seed(seed)

    out_dir.mkdir(parents=True, exist_ok=True)

    raw, features = load_dataset(data_path)
    print(f"Loaded {raw.shape[0]} samples, {raw.shape[1]} features: {features}")

    scaler = fit_scaler(raw)
    scaled = (raw - scaler["mean"]) / scaler["std"]

    # Sliding sequences. Subsample stride keeps memory bounded; a stride
    # of 8 still gives plenty of training sequences on a 130K-sample set.
    seqs_full = make_sequences(scaled, seq_len)
    seqs = seqs_full[::seq_subsample].copy()
    print(
        f"Built {seqs.shape[0]} sequences "
        f"of length {seq_len} (stride {seq_subsample})"
    )

    # Shuffle and split
    idx = np.random.permutation(seqs.shape[0])
    seqs = seqs[idx]
    n_val = int(len(seqs) * val_split)
    train_seqs = seqs[n_val:]
    val_seqs = seqs[:n_val]
    print(f"Train: {len(train_seqs)}  Val: {len(val_seqs)}")

    train_ds = TensorDataset(torch.from_numpy(train_seqs))
    val_ds = TensorDataset(torch.from_numpy(val_seqs))
    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True,
        num_workers=0, drop_last=True,
    )
    val_loader = DataLoader(
        val_ds, batch_size=batch_size, shuffle=False, num_workers=0
    )

    model = LSTMAutoencoder(
        n_features=len(features), hidden=hidden,
        bottleneck=bottleneck, seq_len=seq_len,
    )
    n_params = count_params(model)
    print(f"\nModel param count: {n_params}")
    if n_params > 100_000:
        sys.exit(f"Param count {n_params} > 100K budget. Reduce hidden size.")

    criterion = nn.MSELoss()
    opt = torch.optim.Adam(model.parameters(), lr=lr)

    best_val = float("inf")
    best_state = None
    best_epoch = 0
    no_improve = 0
    history = {"train": [], "val": []}

    print(f"\n{'epoch':>5} {'train':>10} {'val':>10} {'elapsed_s':>10}")
    for epoch in range(1, epochs + 1):
        t0 = time.perf_counter()

        model.train()
        train_loss = 0.0
        for (batch,) in train_loader:
            opt.zero_grad()
            recon = model(batch)
            loss = criterion(recon, batch)
            loss.backward()
            opt.step()
            train_loss += loss.item() * batch.size(0)
        train_loss /= len(train_ds)

        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for (batch,) in val_loader:
                recon = model(batch)
                val_loss += criterion(recon, batch).item() * batch.size(0)
        val_loss /= len(val_ds)

        history["train"].append(train_loss)
        history["val"].append(val_loss)

        elapsed = time.perf_counter() - t0
        print(f"{epoch:>5} {train_loss:>10.5f} {val_loss:>10.5f} {elapsed:>10.1f}")

        if val_loss < best_val - 1e-6:
            best_val = val_loss
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
            best_epoch = epoch
            no_improve = 0
        else:
            no_improve += 1
            if no_improve >= patience:
                print(
                    f"Early stop at epoch {epoch} "
                    f"(no improvement for {patience} epochs)"
                )
                break

    assert best_state is not None
    model.load_state_dict(best_state)
    print(f"\nBest validation loss: {best_val:.5f} at epoch {best_epoch}")

    # ─── Per-feature calibration on the validation set ─────────────
    # The anomaly score normalizes per-feature reconstruction error
    # against these statistics — capturing how much error this feature
    # naturally has on nominal data.
    model.eval()
    per_feature_errors = []
    with torch.no_grad():
        for (batch,) in val_loader:
            recon = model(batch)
            err = (recon - batch).abs()  # (B, T, F)
            # Per-feature per-tick error → flatten over batch+time
            per_feature_errors.append(err.reshape(-1, len(features)).numpy())
    per_feature_errors = np.concatenate(per_feature_errors, axis=0)
    feat_mean = per_feature_errors.mean(axis=0)
    feat_std = np.maximum(per_feature_errors.std(axis=0), 1e-6)

    print("\nValidation reconstruction error per feature (calibration):")
    print(f"{'feature':<20} {'mean_err':>12} {'std_err':>12}")
    for i, f in enumerate(features):
        print(f"{f:<20} {feat_mean[i]:>12.5f} {feat_std[i]:>12.5f}")

    # ─── Save artifacts ────────────────────────────────────────────
    model_path = out_dir / "model.pt"
    scaler_path = out_dir / "scaler.pkl"
    features_path = out_dir / "features.json"

    torch.save({
        "state_dict": best_state,
        "n_features": len(features),
        "hidden": hidden,
        "bottleneck": bottleneck,
        "seq_len": seq_len,
        "param_count": n_params,
        "best_val_loss": float(best_val),
        "best_epoch": int(best_epoch),
    }, model_path)
    with open(scaler_path, "wb") as f:
        pickle.dump(scaler, f)
    with open(features_path, "w") as f:
        json.dump({
            "features": features,
            "seq_len": seq_len,
            "calibration": {
                "feature_error_mean": feat_mean.tolist(),
                "feature_error_std": feat_std.tolist(),
            },
            "param_count": n_params,
            "best_val_loss": float(best_val),
            "best_epoch": int(best_epoch),
        }, f, indent=2)

    print(f"\nSaved {model_path}")
    print(f"Saved {scaler_path}")
    print(f"Saved {features_path}")

    # ─── Inference latency benchmark (median over 100 evals) ───────
    model.eval()
    sample = torch.from_numpy(val_seqs[:1].astype(np.float32))
    latencies_ms = []
    with torch.no_grad():
        # Warm-up
        for _ in range(5):
            _ = model(sample)
        for _ in range(100):
            t0 = time.perf_counter()
            _ = model(sample)
            latencies_ms.append((time.perf_counter() - t0) * 1000.0)
    median_ms = float(np.median(latencies_ms))
    p95_ms = float(np.percentile(latencies_ms, 95))
    print(
        f"\nInference latency over 100 evals: "
        f"median {median_ms:.2f} ms  p95 {p95_ms:.2f} ms"
    )

    final_train = history["train"][best_epoch - 1]
    print(
        f"\nSUMMARY  params={n_params}  "
        f"train_loss={final_train:.5f}  "
        f"val_loss={best_val:.5f}  "
        f"median_latency_ms={median_ms:.2f}"
    )

    return {
        "param_count": n_params,
        "train_loss": final_train,
        "val_loss": best_val,
        "median_latency_ms": median_ms,
        "history": history,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", default=str(DATA_PATH))
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--seq-len", type=int, default=60)
    parser.add_argument("--hidden", type=int, default=24)
    parser.add_argument("--bottleneck", type=int, default=8)
    parser.add_argument("--patience", type=int, default=5)
    parser.add_argument(
        "--seq-subsample", type=int, default=8,
        help="Take every Nth sliding window; lower = more sequences, more RAM",
    )
    args = parser.parse_args()

    train(
        data_path=Path(args.data),
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        seq_len=args.seq_len,
        hidden=args.hidden,
        bottleneck=args.bottleneck,
        patience=args.patience,
        seq_subsample=args.seq_subsample,
    )


if __name__ == "__main__":
    main()
