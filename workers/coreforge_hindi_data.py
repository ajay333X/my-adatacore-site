#!/usr/bin/env python3
"""Prepare public Hindi/Hinglish research examples for CoreForge chatbot.

Explicitly allowlisted Apache-2.0 datasets only. Downloads via Hugging Face,
filters obvious contact details and low-quality rows, and writes versioned
train/validation/test JSONL and a license/provenance manifest.

NOT a complete safety, legal, or quality review; no production promotion.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from coreforge_chat_data import clean, dataset_hash, SYSTEM, BAD

SOURCES = {
    "aya_hindi": {
        "dataset": "CohereLabs/aya_dataset",
        "license": "apache-2.0",
        "url": "https://huggingface.co/datasets/CohereLabs/aya_dataset",
        "language": "hi",
        "kind": "human_annotated",
    },
    "hinglish": {
        "dataset": "DSMJ910/hinglish-instruct-10k",
        "license": "apache-2.0",
        "url": "https://huggingface.co/datasets/DSMJ910/hinglish-instruct-10k",
        "language": "hi-Latn",
        "kind": "synthetic",
    },
}


def from_aya(rows):
    for row in rows:
        if str(row.get("language_code") or "").lower() != "hin":
            continue
        if row.get("annotation_type") not in ("original-annotations", "re-annotations"):
            continue
        yield row.get("inputs"), row.get("targets"), row.get("annotation_type")


def from_hinglish(rows):
    for row in rows:
        yield row.get("user_message"), row.get("assistant_response"), row.get("category") or "synthetic"


def candidates(name: str):
    from datasets import load_dataset
    spec = SOURCES[name]
    # Streaming avoids downloading large full corpora into the runner.
    data = load_dataset(spec["dataset"], split="train", streaming=True)
    parser = from_aya if name == "aya_hindi" else from_hinglish
    yield from parser(data)


def run(args):
    if not args.accept_license:
        raise ValueError("Review upstream dataset cards and pass --accept-license to confirm")
    if not 40 <= args.limit <= 10000:
        raise ValueError("The per-source limit must be 40..10000")
    sources = args.sources.split(",")
    if not sources or any(s not in SOURCES for s in sources) or len(set(sources)) != len(sources):
        raise ValueError("Use unique allowlisted --sources: aya_hindi,hinglish")

    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    counts = Counter()
    accepted = []
    seen = set()
    for source in sources:
        n = 0
        for question, answer, subtype in candidates(source):
            counts[source + "_scanned"] += 1
            raw_q, raw_a = str(question or ""), str(answer or "")
            if not (20 <= len(raw_q) <= 2500 and 30 <= len(raw_a) <= 3500):
                counts[source + "_length_rejected"] += 1
                continue
            question, answer = clean(raw_q), clean(raw_a)
            if "[redacted]" in question or "[redacted]" in answer:
                counts[source + "_contact_redacted"] += 1
                # Do not include contact-containing examples even after redaction.
                continue
            if any(term in (question + " " + answer).lower() for term in BAD):
                counts[source + "_policy_filtered"] += 1
                continue
            if source == "aya_hindi":
                devanagari = sum("\u0900" <= ch <= "\u097f" for ch in (question + answer))
                if devanagari < 12:
                    counts[source + "_script_filtered"] += 1
                    continue
            fingerprint = hashlib.sha256((question.casefold() + "\n" + answer.casefold()).encode()).hexdigest()
            if fingerprint in seen:
                counts[source + "_duplicate"] += 1
                continue
            seen.add(fingerprint)
            spec = SOURCES[source]
            accepted.append({
                "messages": [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": question},
                    {"role": "assistant", "content": answer},
                ],
                "source": source,
                "source_dataset": spec["dataset"],
                "source_license": spec["license"],
                "language": spec["language"],
                "quality_type": str(subtype or spec["kind"])[:80],
            })
            n += 1
            if n >= args.limit:
                break
        counts[source + "_accepted"] = n
        if n < 20:
            raise RuntimeError(f"{source} produced too few valid records ({n}); aborting")

    # Deterministic splits and integrity digests match existing LoRA trainer.
    splits = {"train": [], "validation": [], "test": []}
    for row in accepted:
        key = hashlib.sha256(json.dumps(row["messages"], sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        bucket = int(key[:8], 16) % 100
        split = "test" if bucket < 10 else "validation" if bucket < 20 else "train"
        splits[split].append(row)
    if not all(splits.values()):
        raise RuntimeError("Empty data split. Increase source limits")
    for name, rows in splits.items():
        (out / f"{name}.jsonl").write_text(
            "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
            encoding="utf-8",
        )
    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset_purpose": "CoreForge chatbot Hindi/Hinglish research",
        "license_acknowledged": True,
        "source_name": "+".join(sources),
        "sources": [SOURCES[s] for s in sources],
        "source": SOURCES[sources[0]],
        "prepared_count": len(accepted),
        "counts": dict(counts),
        "splits": {s: len(v) for s, v in splits.items()},
        "sha256": {s: dataset_hash(v) for s, v in splits.items()},
        "privacy": "obvious_contact_records_excluded_manual_privacy_review_still_required",
        "production_approval": False,
        "training_use": "research_prototype_only_until_human_approval",
        "note": "Public source data only. No Adatacore contributor or customer data. Training has not begun.",
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"output": str(out), "manifest": manifest}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--sources", default="aya_hindi,hinglish")
    cli.add_argument("--limit", type=int, default=250)
    cli.add_argument("--out", default="coreforge-hindi-data")
    cli.add_argument("--accept-license", action="store_true")
    run(cli.parse_args())
