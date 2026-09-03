# CoreForge worker

The CoreForge worker runs **outside Supabase/Vercel** on a GPU machine. CoreForge remains the control plane; the worker performs dataset streaming, manifest materialization, fine-tuning and evaluation.

## 1. Create a worker token

Open **Admin → CoreForge → Workers → Create worker key**. The token is shown once. Store it as an environment variable; CoreForge stores only its SHA-256 hash.

## 2. Install

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r workers/requirements-coreforge.txt
```

A CUDA-enabled PyTorch installation is strongly recommended. CPU training is technically possible but not practical for the default Whisper Small bootstrap run.

## 3. Configure

```bash
export COREFORGE_WORKER_TOKEN='cfw_...'
export COREFORGE_WORKDIR="$HOME/coreforge-data"
```

For gated Hugging Face datasets such as AI4Bharat IndicVoices, first accept the dataset terms in your Hugging Face account, then also set:

```bash
export HF_TOKEN='hf_...'
```

Optional: to upload a successful model to a private Hugging Face model repository instead of keeping the artifact only on the worker disk:

```bash
export COREFORGE_HF_MODEL_REPO='your-org/adatacore-hindi-speech-v01'
```

## 4. Run unattended

```bash
python workers/coreforge_worker.py
```

The worker polls the CoreForge gateway, claims one authorized queued job, streams only the frozen/approved dataset sources, records the exact external manifest, trains, evaluates WER/CER and reports the result. It can be kept alive with systemd, Docker, tmux, a VM, or any GPU provider.

## Current bootstrap

CoreForge seeds **Adatacore Hindi Speech v0.1** using `openai/whisper-small` and a target of 20 hours from the connected Common Voice Hindi source. The job stays queued until a worker is online; no browser tab needs to remain open.

Production promotion is never automatic. A successful worker run is registered as a **candidate** model for Super-Admin review.
