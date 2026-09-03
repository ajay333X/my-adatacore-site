#!/usr/bin/env python3
"""CoreForge external training worker.

Runs outside Supabase on a machine with a GPU. It claims authorized jobs from the
CoreForge Worker Gateway, streams frozen open-data sources, materializes an exact
manifest, fine-tunes Whisper, evaluates WER/CER, and reports the candidate back.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import socket
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
import requests
import soundfile as sf
import torch
from datasets import Audio, Dataset, load_dataset
from huggingface_hub import HfApi
from jiwer import cer, wer
from transformers import (
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    WhisperForConditionalGeneration,
    WhisperProcessor,
)

PROJECT_REF = "llmhyezgcnbognmmsnzq"
GATEWAY = os.getenv(
    "COREFORGE_GATEWAY",
    f"https://{PROJECT_REF}.supabase.co/functions/v1/coreforge-worker",
)
TOKEN = os.getenv("COREFORGE_WORKER_TOKEN", "").strip()
HF_TOKEN = os.getenv("HF_TOKEN") or None
WORKDIR = Path(os.getenv("COREFORGE_WORKDIR", "./.coreforge")).resolve()
POLL_SECONDS = max(10, int(os.getenv("COREFORGE_POLL_SECONDS", "30")))


def post(payload: dict[str, Any], timeout: int = 60) -> dict[str, Any]:
    r = requests.post(
        GATEWAY,
        headers={"X-CoreForge-Worker": TOKEN, "Content-Type": "application/json"},
        json=payload,
        timeout=timeout,
    )
    r.raise_for_status()
    return r.json()


def heartbeat(run_id: str, stage: str, progress: float, message: str) -> None:
    try:
        post({"action": "heartbeat", "run_id": run_id, "stage": stage, "progress": progress, "message": message}, 30)
    except Exception as exc:
        print(f"heartbeat warning: {exc}", file=sys.stderr)


def stable_split(speaker: str, train_pct: int, validation_pct: int) -> str:
    bucket = int(hashlib.sha256(speaker.encode("utf-8")).hexdigest()[:8], 16) % 100
    if bucket < train_pct:
        return "train"
    if bucket < train_pct + validation_pct:
        return "validation"
    return "test"


def save_manifest(run_id: str, source_id: str, revision: str, items: list[dict[str, Any]]) -> None:
    for i in range(0, len(items), 250):
        post(
            {
                "action": "manifest",
                "run_id": run_id,
                "source_id": source_id,
                "resolved_revision": revision,
                "items": items[i : i + 250],
            },
            90,
        )


def materialize_source(run: dict[str, Any], dataset_meta: dict[str, Any], source: dict[str, Any], root: Path) -> list[dict[str, Any]]:
    connector = source.get("connector") or {}
    if connector.get("provider") != "huggingface":
        raise RuntimeError(f"Unsupported open-data provider: {connector.get('provider')}")
    if connector.get("gated") and not HF_TOKEN:
        env_name = connector.get("token_env_name") or "HF_TOKEN"
        raise RuntimeError(f"{connector.get('dataset_ref')} is gated. Set {env_name} on the worker after accepting the dataset terms.")

    repo = connector["dataset_ref"]
    config = connector.get("dataset_config") or None
    api = HfApi(token=HF_TOKEN)
    revision = api.dataset_info(repo, token=HF_TOKEN).sha
    meta = connector.get("metadata") or {}
    split_name = meta.get("split", "train")
    audio_col = meta.get("audio_column", "audio")
    text_col = meta.get("text_column", "sentence")
    speaker_col = meta.get("speaker_column", "client_id")

    criteria = dataset_meta.get("criteria") or {}
    target_hours = float((run.get("config") or {}).get("target_hours") or criteria.get("external_target_hours") or 20)
    train_pct = int((run.get("config") or {}).get("train_pct") or criteria.get("train_pct") or 90)
    validation_pct = int((run.get("config") or {}).get("validation_pct") or criteria.get("validation_pct") or 5)

    print(f"Streaming {repo}/{config or '-'}@{revision[:12]} until {target_hours:.1f}h")
    ds = load_dataset(repo, config, split=split_name, streaming=True, revision=revision, token=HF_TOKEN)
    try:
        ds = ds.cast_column(audio_col, Audio(sampling_rate=16000))
    except Exception:
        pass

    source_dir = root / source["source_id"]
    source_dir.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, Any]] = []
    manifest: list[dict[str, Any]] = []
    total_ms = 0

    for idx, row in enumerate(ds):
        text = str(row.get(text_col) or row.get("transcription") or row.get("text") or "").strip()
        if not text:
            continue
        audio = row.get(audio_col)
        if not isinstance(audio, dict) or audio.get("array") is None:
            continue
        arr = np.asarray(audio["array"], dtype=np.float32)
        if arr.ndim > 1:
            arr = arr.mean(axis=-1)
        sr = int(audio.get("sampling_rate") or 16000)
        if sr != 16000:
            import librosa
            arr = librosa.resample(arr, orig_sr=sr, target_sr=16000)
            sr = 16000
        if arr.size < sr // 4:
            continue
        duration_ms = int(round(arr.size / sr * 1000))
        if duration_ms > 30_000:
            continue

        speaker = str(row.get(speaker_col) or row.get("speaker_id") or row.get("path") or f"row-{idx}")
        split = stable_split(speaker, train_pct, validation_pct)
        external_key = str(row.get("path") or row.get("id") or hashlib.sha256(f"{repo}:{revision}:{idx}:{text}".encode()).hexdigest())
        file_key = hashlib.sha256(external_key.encode()).hexdigest()[:24]
        wav_path = source_dir / f"{file_key}.wav"
        sf.write(wav_path, arr, sr, subtype="PCM_16")
        transcript_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
        speaker_hash = hashlib.sha256(speaker.encode("utf-8")).hexdigest()

        rows.append({"audio_path": str(wav_path), "text": text, "split": split})
        manifest.append(
            {
                "external_key": external_key,
                "split": split,
                "duration_ms": duration_ms,
                "transcript_hash": transcript_hash,
                "remote_uri": f"hf://datasets/{repo}@{revision}/{external_key}",
                "metadata": {"speaker_hash": speaker_hash, "dataset_ref": repo, "revision": revision},
            }
        )
        total_ms += duration_ms
        if len(rows) % 100 == 0:
            progress = min(25.0, 5 + 20 * (total_ms / max(1, target_hours * 3_600_000)))
            heartbeat(run["id"], "preparing", progress, f"Prepared {total_ms/3_600_000:.2f} / {target_hours:.1f} hours")
        if total_ms >= target_hours * 3_600_000:
            break

    if not rows:
        raise RuntimeError("No usable audio/transcript pairs were materialized from the open dataset")
    save_manifest(run["id"], source["source_id"], revision, manifest)
    print(f"Prepared {len(rows)} examples / {total_ms/3_600_000:.2f} hours")
    return rows


class WhisperCollator:
    def __init__(self, processor: WhisperProcessor):
        self.processor = processor

    def __call__(self, features: list[dict[str, Any]]) -> dict[str, torch.Tensor]:
        inputs = [{"input_features": f["input_features"]} for f in features]
        batch = self.processor.feature_extractor.pad(inputs, return_tensors="pt")
        label_features = [{"input_ids": f["labels"]} for f in features]
        labels_batch = self.processor.tokenizer.pad(label_features, return_tensors="pt")
        labels = labels_batch["input_ids"].masked_fill(labels_batch.attention_mask.ne(1), -100)
        if (labels[:, 0] == self.processor.tokenizer.bos_token_id).all().cpu().item():
            labels = labels[:, 1:]
        batch["labels"] = labels
        return batch


def train_asr(payload: dict[str, Any]) -> tuple[dict[str, float], str]:
    run = payload["job"]
    dataset_meta = payload["dataset"]
    sources = [s for s in payload.get("sources", []) if s.get("source_kind") == "open_dataset"]
    if not sources:
        raise RuntimeError("This worker version needs at least one open-data source")

    root = WORKDIR / run["run_code"]
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True, exist_ok=True)

    all_rows: list[dict[str, Any]] = []
    for source in sources:
        all_rows.extend(materialize_source(run, dataset_meta, source, root / "data"))

    heartbeat(run["id"], "preparing", 28, f"Prepared {len(all_rows)} examples; loading {run['base_model']}")
    processor = WhisperProcessor.from_pretrained(run["base_model"], language="Hindi", task="transcribe")
    model = WhisperForConditionalGeneration.from_pretrained(run["base_model"])
    model.generation_config.language = "hindi"
    model.generation_config.task = "transcribe"
    model.generation_config.forced_decoder_ids = None

    raw = Dataset.from_list(all_rows)

    def featurize(row: dict[str, Any]) -> dict[str, Any]:
        arr, sr = sf.read(row["audio_path"], dtype="float32")
        if arr.ndim > 1:
            arr = arr.mean(axis=1)
        if sr != 16000:
            import librosa
            arr = librosa.resample(arr, orig_sr=sr, target_sr=16000)
        row["input_features"] = processor.feature_extractor(arr, sampling_rate=16000).input_features[0]
        row["labels"] = processor.tokenizer(row["text"]).input_ids
        return row

    prepared = raw.map(featurize, remove_columns=["audio_path"])
    train_ds = prepared.filter(lambda x: x["split"] == "train").remove_columns(["text", "split"])
    val_ds_full = prepared.filter(lambda x: x["split"] == "validation")
    test_ds_full = prepared.filter(lambda x: x["split"] == "test")
    val_ds = val_ds_full.remove_columns(["text", "split"])
    test_ds = test_ds_full.remove_columns(["text", "split"])
    if len(val_ds) == 0 or len(test_ds) == 0:
        raise RuntimeError("Speaker-safe split produced an empty validation/test set; increase target hours")

    output = root / "model"
    cfg = run.get("config") or {}
    args = Seq2SeqTrainingArguments(
        output_dir=str(output),
        per_device_train_batch_size=int(cfg.get("batch_size", 8 if torch.cuda.is_available() else 1)),
        gradient_accumulation_steps=int(cfg.get("gradient_accumulation_steps", 2)),
        learning_rate=float(cfg.get("learning_rate", 1e-5)),
        warmup_ratio=0.05,
        num_train_epochs=float(cfg.get("epochs", 3)),
        gradient_checkpointing=True,
        fp16=bool(torch.cuda.is_available()),
        evaluation_strategy="epoch",
        save_strategy="epoch",
        logging_steps=25,
        predict_with_generate=True,
        generation_max_length=225,
        load_best_model_at_end=True,
        metric_for_best_model="wer",
        greater_is_better=False,
        report_to=[],
        save_total_limit=2,
    )

    def metrics(pred: Any) -> dict[str, float]:
        pred_ids = pred.predictions[0] if isinstance(pred.predictions, tuple) else pred.predictions
        label_ids = pred.label_ids.copy()
        label_ids[label_ids == -100] = processor.tokenizer.pad_token_id
        hyp = processor.tokenizer.batch_decode(pred_ids, skip_special_tokens=True)
        ref = processor.tokenizer.batch_decode(label_ids, skip_special_tokens=True)
        return {"wer": float(wer(ref, hyp)), "cer": float(cer(ref, hyp))}

    trainer = Seq2SeqTrainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        data_collator=WhisperCollator(processor),
        compute_metrics=metrics,
        tokenizer=processor.feature_extractor,
    )
    heartbeat(run["id"], "training", 35, f"Training {len(train_ds)} examples")
    trainer.train()
    heartbeat(run["id"], "evaluating", 88, f"Evaluating {len(test_ds)} held-out examples")
    test_result = trainer.predict(test_ds)
    result = metrics(test_result)
    result.update({"train_examples": len(train_ds), "validation_examples": len(val_ds), "test_examples": len(test_ds)})

    trainer.save_model(str(output))
    processor.save_pretrained(str(output))
    artifact_uri = f"file://{output}"

    target_repo = os.getenv("COREFORGE_HF_MODEL_REPO", "").strip()
    if target_repo:
        model.push_to_hub(target_repo, token=HF_TOKEN, private=True)
        processor.push_to_hub(target_repo, token=HF_TOKEN, private=True)
        artifact_uri = f"hf://models/{target_repo}"
    return result, artifact_uri


def process(payload: dict[str, Any]) -> None:
    run = payload["job"]
    try:
        if run.get("task") != "asr":
            raise RuntimeError(f"Worker currently supports ASR jobs only, not {run.get('task')}")
        metrics, artifact = train_asr(payload)
        post({"action": "finish", "run_id": run["id"], "success": True, "metrics": metrics, "artifact_uri": artifact}, 60)
        print(f"{run['run_code']} complete: {json.dumps(metrics)}")
    except Exception as exc:
        print(f"{run['run_code']} failed: {exc}", file=sys.stderr)
        try:
            post({"action": "finish", "run_id": run["id"], "success": False, "error_message": str(exc)[:1800]}, 60)
        except Exception as report_exc:
            print(f"Could not report failure: {report_exc}", file=sys.stderr)


def main() -> None:
    if not TOKEN.startswith("cfw_"):
        raise SystemExit("Set COREFORGE_WORKER_TOKEN to the one-time token created in Admin → CoreForge → Workers")
    WORKDIR.mkdir(parents=True, exist_ok=True)
    capabilities = {
        "host": socket.gethostname(),
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "cuda": torch.cuda.is_available(),
        "worker_version": "0.1.0",
        "tasks": ["asr"],
    }
    print(f"CoreForge worker online: {capabilities}")
    while True:
        try:
            payload = post({"action": "claim", "capabilities": capabilities}, 60)
            if payload.get("job"):
                process(payload)
            else:
                time.sleep(POLL_SECONDS)
        except KeyboardInterrupt:
            return
        except Exception as exc:
            print(f"poll error: {exc}", file=sys.stderr)
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
