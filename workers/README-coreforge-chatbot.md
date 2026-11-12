# CoreForge Chatbot — open-weight research pipeline

## What is already implemented
- **Local Chatbot Lab**: `/admin/coreforge-chatbot`. Admin Super-Admin only, ONNX Qwen3-0.6B browser inference with WebGPU. Browser downloads weights from Hugging Face once and runs inference on the user's device. No Groq tokens are spent for chatbot inference. The model is a **public unmodified baseline** and cannot be called an Adatacore-trained checkpoint.
- **Licensed dataset preparation**: `workers/coreforge_chat_data.py` uses only the explicit OASST1 (Apache 2.0) and UltraChat (MIT metadata; independently review before commercial use) allowlist. Includes heuristic contact redaction, deduplication, deterministic train/validation/test split, manifest with file digests. Not a comprehensive PII/safety classifier.
- **Weekly public-data refresh**: GitHub Actions workflow `coreforge-chatbot-data.yml`, 250 examples, public OASST1 only, saves a short-lived GitHub artifact. No private project data is read, no GPU is started. Uses Actions quota.
- **Experimental LoRA training**: `workers/coreforge_chat_train.py`, Qwen3-0.6B/1.7B, requires NVIDIA GPU and `--approve-research-run`, verifies manifest checksums, saves adapter and held-out loss. No automatic publishing.
- **Colab notebook**: `workers/CoreForge_Chatbot_Colab.ipynb`. Choose free GPU if available, then run the cells. Kaggle may also run the scripts with compatible dependencies.

## CoreForge speech and chat are separate
The existing CoreForge `coreforge_worker.py` handles **Whisper ASR only**. Do not route chat jobs to that worker: it rejects any task other than `asr`. The new chatbot pipeline intentionally lives alongside it and does not change existing queues, transcript projects, production AI responses, or training rights classifications.

## Security and permissions
- No pasted worker tokens, service-role secrets, or client-sensitive documents in training notebooks, datasets, or GitHub artifacts.
- The previously shared `cfw_` token must be revoked; issue a new key privately for *speech* worker if needed. The chat training scripts do not need that token.
- No permission to fine-tune on arbitrary Adatacore recordings, customer projects, private emails, or copyrighted datasets without explicit training rights.
- A basic redact/filter pass is insufficient for sensitive data; human review and privacy/safety tests remain required before production.
- Model adapters and datasets are **research artifacts** until independently evaluated and manually approved.
- Browser prompt text stays in the tab and is fed to on-device generation, though model weights and code are fetched from public CDN/HF; do not assume offline-first availability on the initial download.

## What is NOT automated yet
Free GPU session allocation, external provider account sign-in, persistent public inference hosting, production model promotion, model conversion to browser ONNX, safety signoff. No free service guarantees permanent 24/7 GPU capacity. The current trained adapter does not automatically become the deployed chatbot. Do not tell users training happened without successful GPU logs and a checkpoint.

## Research CLI
```bash
python -m pip install "datasets>=3,<5"
python workers/coreforge_chat_data.py --source oasst1 --limit 500 --accept-license --out coreforge-chatbot-data
# On an actual supported NVIDIA GPU with Unsloth + Transformers installed:
python workers/coreforge_chat_train.py --data coreforge-chatbot-data --output coreforge-chatbot-checkpoint --max-steps 100 --approve-research-run
```
Review manifest.json, validation/test splits, and training_report.json before any model promotion.

## Intended next stages
1. Independent authenticated browser and WebGPU runtime test of the local chatbot UI.
2. Verify GitHub Actions dataset artifact end-to-end on first run.
3. Free GPU LoRA test and benchmark against baseline; report hallucinations, Hindi performance and safety.
4. Build signed adapter registry and production inference endpoint; no release before explicit approval and verified resource availability.
