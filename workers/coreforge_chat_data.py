#!/usr/bin/env python3
"""CoreForge chatbot dataset preparation (does not use private Adatacore data).

This script downloads only explicitly allowlisted publicly licensed datasets,
creates simple user/assistant examples, strips basic contact identifiers, and
deterministically separates train/validation/test data.

This is a starter pipeline, NOT a guarantee that every source row is harmless
or appropriate for production. A human must still review before deployment.
"""
import argparse
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

SOURCES = {
    "oasst1": {"dataset": "OpenAssistant/oasst1", "config": None, "license": "apache-2.0", "revision": "main"},
    "ultrachat": {"dataset": "HuggingFaceH4/ultrachat_200k", "config": None, "license": "mit", "revision": "main"},
}
CONTACT = re.compile(r"(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[\d\s().-]{8,}\d))")
URL = re.compile(r"https?://\S+", re.IGNORECASE)
SECRET = re.compile(r"(?i)\b(?:api[_ -]?key|password|secret|token)\s*[:=]\s*\S+")
SYSTEM = "You are Adatacore Assistant. Answer clearly and accurately. If you are uncertain, say so."
BAD = ("how to make a bomb", "instructions for malware", "credit card number", "social security number")


def clean(value):
    text = str(value or "").replace("\x00", " ").strip()
    text = CONTACT.sub("[redacted]", text)
    text = URL.sub("[link]", text)
    text = SECRET.sub("[redacted]", text)
    return text[:3500]


def valid_messages(messages):
    if not isinstance(messages, list):
        return None
    messages = [{"role": x.get("role"), "content": clean(x.get("content"))}
                for x in messages if isinstance(x, dict)]
    messages = [m for m in messages if m["role"] in ("user", "assistant") and len(m["content"]) > 14]
    if len(messages) < 2:
        return None
    pair = next(((messages[i]["content"], messages[i+1]["content"])
                 for i in range(len(messages)-1)
                 if messages[i]["role"] == "user" and messages[i+1]["role"] == "assistant"), None)
    return pair


def oasst_samples(limit):
    from datasets import load_dataset
    dataset = load_dataset(SOURCES["oasst1"]["dataset"], split="train")
    prompts = {}
    for row in dataset:
        if row.get("lang") != "en" or row.get("deleted"):
            continue
        if row.get("role") == "prompter":
            prompts[row.get("message_id")] = clean(row.get("text"))
    n = 0
    for row in dataset:
        if row.get("role") != "assistant" or row.get("lang") != "en" or row.get("deleted"):
            continue
        question = prompts.get(row.get("parent_id"))
        answer = clean(row.get("text"))
        if question and answer:
            yield question, answer
            n += 1
            if n >= limit: return


def ultrachat_samples(limit):
    from datasets import load_dataset
    source = SOURCES["ultrachat"]
    rows = load_dataset(source["dataset"], split="train_sft", streaming=True)
    n = 0
    for row in rows:
        pair = valid_messages(row.get("messages"))
        if pair:
            yield pair
            n += 1
            if n >= limit: return


def dataset_hash(rows):
    return hashlib.sha256("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows).encode()).hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", choices=sorted(SOURCES), default="oasst1")
    p.add_argument("--limit", type=int, default=500, help="Maximum reviewed candidates to prepare (max 20000)")
    p.add_argument("--out", default="coreforge-chatbot-data")
    p.add_argument("--accept-license", action="store_true", help="Acknowledge the named upstream dataset license")
    args = p.parse_args()
    if not args.accept_license:
        p.error("Explicit --accept-license is required; review upstream dataset terms first.")
    if not 20 <= args.limit <= 20000:
        p.error("--limit must be 20..20000")
    source = SOURCES[args.source]
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    fetch = oasst_samples if args.source == "oasst1" else ultrachat_samples
    rows, seen = [], set()
    counts = Counter()
    for question, answer in fetch(args.limit * 5):
        counts["scanned"] += 1
        if not (20 <= len(question) <= 2500 and 30 <= len(answer) <= 3500):
            counts["invalid_length"] += 1
            continue
        if any(bad in (question + " " + answer).lower() for bad in BAD):
            counts["policy_filter"] += 1
            continue
        fingerprint = hashlib.sha256((question.lower() + "\n" + answer.lower()).encode()).hexdigest()
        if fingerprint in seen:
            counts["duplicate"] += 1
            continue
        seen.add(fingerprint)
        rows.append({"messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": question}, {"role": "assistant", "content": answer}], "source": args.source, "source_license": source["license"]})
        if len(rows) >= args.limit: break
    if len(rows) < 20:
        raise SystemExit("Insufficient usable records. Review source connectivity or filters.")
    subsets = {"train": [], "validation": [], "test": []}
    for row in rows:
        key = hashlib.sha256(json.dumps(row["messages"], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        bucket = int(key[:8], 16) % 100
        split = "test" if bucket < 10 else "validation" if bucket < 20 else "train"
        subsets[split].append(row)
    if not all(subsets.values()):
        raise SystemExit("One split was empty; increase --limit")
    for split, items in subsets.items():
        (out / f"{split}.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in items), encoding="utf-8")
    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": source, "license_acknowledged": True, "source_name": args.source,
        "prepared_count": len(rows), "counts": dict(counts),
        "splits": {key: len(value) for key, value in subsets.items()},
        "sha256": {key: dataset_hash(value) for key, value in subsets.items()},
        "privacy": "heuristic_contact_redaction_only_manual_review_required",
        "production_approval": False,
        "training_use": "research_prototype_only_until_human_approval",
        "note": "No private Adatacore training or customer data ingested.",
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(out), "manifest": manifest}, indent=2))


if __name__ == "__main__":
    main()
