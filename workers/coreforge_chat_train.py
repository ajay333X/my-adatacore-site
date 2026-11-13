#!/usr/bin/env python3
"""Experimental Qwen LoRA training on a user-supplied GPU (never run on Vercel).

Inputs: provenance-tracked JSONL produced by coreforge_chat_data.py.
Outputs: LoRA adapter, held-out evaluation, machine-readable manifest.
No automatic publishing, model promotion, or paid GPU provisioning.
"""
import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

def read_jsonl(path):
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]

def build_training_row(row, tokenizer, max_tokens, model_name):
    chat_kwargs = {} if model_name.endswith("-Instruct-2507") else {"enable_thinking": False}
    messages = row["messages"]
    prefix = tokenizer.apply_chat_template(messages[:-1], tokenize=False, add_generation_prompt=True, **chat_kwargs)
    full = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False, **chat_kwargs)
    prompt_ids = tokenizer(prefix, add_special_tokens=False)["input_ids"]
    ids = tokenizer(full, add_special_tokens=False)["input_ids"][:max_tokens]
    labels = [-100] * min(len(prompt_ids), len(ids)) + ids[len(prompt_ids):]
    if all(label == -100 for label in labels):
        return None
    return {"input_ids": ids, "labels": labels}

def main():
    cli = argparse.ArgumentParser()
    cli.add_argument("--data", default="coreforge-chatbot-data")
    cli.add_argument("--output", default="coreforge-chatbot-checkpoint")
    cli.add_argument("--model", default="Qwen/Qwen3-0.6B")
    cli.add_argument("--epochs", type=float, default=1.0)
    cli.add_argument("--max-steps", type=int, default=120)
    cli.add_argument("--batch-size", type=int, default=1)
    cli.add_argument("--max-tokens", type=int, default=768)
    cli.add_argument("--approve-research-run", action="store_true")
    args = cli.parse_args()
    if not args.approve_research_run:
        cli.error("--approve-research-run required; this runs GPU training")
    if not (1 <= args.max_steps <= 1000 and 128 <= args.max_tokens <= 2048):
        cli.error("max-steps must be 1..1000; max-tokens 128..2048")
    if args.model not in ("Qwen/Qwen3-0.6B", "Qwen/Qwen3-1.7B", "Qwen/Qwen3-4B-Instruct-2507"):
        cli.error("Only explicitly reviewed open-weight Qwen3 checkpoints allowed")
    import torch
    if not torch.cuda.is_available():
        raise SystemExit("No CUDA GPU detected. Enable a Kaggle or Colab GPU first.")
    from unsloth import FastLanguageModel
    from datasets import Dataset
    from transformers import Trainer, TrainingArguments
    root = Path(args.data)
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    if not manifest.get("license_acknowledged") or manifest.get("production_approval"):
        raise SystemExit("Unexpected dataset approval state. Review source manifest.")
    raw_train = read_jsonl(root / "train.jsonl")
    raw_val = read_jsonl(root / "validation.jsonl")
    raw_test = read_jsonl(root / "test.jsonl")
    for name, rows in [("train", raw_train), ("validation", raw_val), ("test", raw_test)]:
        digest = hashlib.sha256("".join(json.dumps(row, ensure_ascii=False, sort_keys=True)+"\n" for row in rows).encode()).hexdigest()
        if digest != manifest["sha256"][name]:
            raise SystemExit(f"Dataset {name} hash mismatch; training cancelled.")
    model, tokenizer = FastLanguageModel.from_pretrained(model_name=args.model, max_seq_length=args.max_tokens, load_in_4bit=True)
    model = FastLanguageModel.get_peft_model(model, r=8, target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"], lora_alpha=16, lora_dropout=0, bias="none", use_gradient_checkpointing="unsloth", random_state=3407)
    train = [x for row in raw_train if (x := build_training_row(row, tokenizer, args.max_tokens, args.model))]
    val = [x for row in raw_val if (x := build_training_row(row, tokenizer, args.max_tokens))]
    if not train or not val: raise SystemExit("No nonempty training/validation labels")
    def collate(batch):
        max_len=max(len(x["input_ids"]) for x in batch)
        ids, labels, masks = [], [], []
        for x in batch:
            pad=max_len-len(x["input_ids"])
            ids.append(x["input_ids"] + [tokenizer.pad_token_id]*pad)
            labels.append(x["labels"] + [-100]*pad)
            masks.append([1]*len(x["input_ids"])+[0]*pad)
        return {k:torch.tensor(v,dtype=torch.long) for k,v in {"input_ids":ids,"labels":labels,"attention_mask":masks}.items()}
    output=Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    steps=TrainingArguments(output_dir=str(output / "trainer"), per_device_train_batch_size=args.batch_size, gradient_accumulation_steps=4, learning_rate=2e-4, num_train_epochs=args.epochs, max_steps=args.max_steps, eval_strategy="epoch", save_strategy="epoch", logging_steps=10, report_to="none", fp16=not torch.cuda.is_bf16_supported(), bf16=torch.cuda.is_bf16_supported(), save_total_limit=1)
    trainer=Trainer(model=model, args=steps, train_dataset=Dataset.from_list(train), eval_dataset=Dataset.from_list(val), data_collator=collate)
    result=trainer.train()
    val_metrics=trainer.evaluate()
    model.save_pretrained(str(output / "adapter"))
    tokenizer.save_pretrained(str(output / "adapter"))
    # Held-out evaluation: report test loss; no invented quality score.
    test=[x for row in raw_test if (x := build_training_row(row, tokenizer, args.max_tokens))]
    test_metrics=trainer.evaluate(Dataset.from_list(test)) if test else {}
    record={"created_at":datetime.now(timezone.utc).isoformat(),"base_model":args.model,"model_license":"apache-2.0","artifact_kind":"lora_adapter_not_merged_model","source_manifest_sha256":hashlib.sha256((root/"manifest.json").read_bytes()).hexdigest(),"dataset_splits":manifest["splits"],"train_metrics":result.metrics,"validation_metrics":val_metrics,"test_metrics":test_metrics,"production_approved":False,"external_hosted":False,"note":"Research checkpoint. Needs human benchmark review and an inference deployment before use."}
    (output/"training_report.json").write_text(json.dumps(record, indent=2, default=str), encoding="utf-8")
    print(json.dumps({"result":"training_complete","adapter":str(output/"adapter"),"report":str(output/"training_report.json")},indent=2))
if __name__=="__main__":
    main()
