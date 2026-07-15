# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development

```bash
npm run dev          # Start Vite dev server + Electron together
```

Local AI engine setup (one-time):
```bash
brew install ollama                 # or download from ollama.com (Windows/Linux)
ollama pull gemma4:e2b              # ~7.2GB, one-time
```
`electron/ollama.js` spawns `ollama serve` automatically on app start if no instance is already running (reuses an existing one otherwise). The renderer polls `check-engine` and prompts the user to download the model if it's missing.

Python engine setup (one-time):
```bash
cd engine
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Test the Python engine directly (no Electron needed — requires `ollama serve` running):
```bash
cd engine && source venv/bin/activate
python -m engine.processor --input ../test_input --output ../test_output
```

### Build

```bash
npm run build:vite      # Build React frontend → dist/
npm run build           # Full build: Vite + electron-builder → dist_electron/
```

Production builds require two binaries in `resources/bin/`: the compiled Python sidecar (`engine-bin`) and the Ollama sidecar (`ollama`/`ollama.exe`). CI builds both (see `.github/workflows/release.yml`) — the Ollama binary is downloaded from the official GitHub releases and trimmed of CUDA/ROCm backends (CPU-only inference; this app doesn't use GPU acceleration), verified with a serve+health-check smoke test on each target OS.

For local production testing, build the Python sidecar manually:
```bash
cd engine && source venv/bin/activate
pyinstaller --onefile --name engine-bin --distpath ../resources/bin engine/processor.py
```
and copy an `ollama` binary into `resources/bin/` yourself (e.g. `cp $(which ollama) resources/bin/`).

### Release

Push a version tag — CI builds and publishes installers for all platforms automatically:
```bash
git tag v1.2.3 && git push origin v1.2.3
```

## Architecture

Four layers communicating via IPC and local HTTP:

```
React UI (renderer)  ──IPC──►  Electron main  ──spawn──►  Python sidecar  ──HTTP──►  Ollama sidecar
  src/App.tsx              electron/main.js             engine/processor.py      electron/ollama.js
  src/electron.d.ts        electron/preload.js          engine/anonymizer.py     (spawned by main)
                            electron/ollama.js           engine/llm_client.py
```

**Renderer → Main IPC** (bridged in `preload.js`, typed in `src/electron.d.ts`):
- `select-folder` — OS folder picker
- `start-anonymization` — spawns Python, streams `progress-update` / `warning-update` events back via `webContents.send`
- `check-engine` — returns `{running, modelPresent, model}` for the Ollama sidecar
- `pull-engine-model` — triggers model download, streams `engine-pull-progress` events
- `open-folder` / `open-external` / `get-app-version`

**Main → Ollama sidecar** (`electron/ollama.js`):
- `ensureRunning()` on app start: probes `http://127.0.0.1:11434/api/tags`; reuses an already-running instance or spawns `ollama serve` (dev: PATH/common install paths; prod: `resources/bin/ollama`)
- Stopped on `window-all-closed` / `before-quit`, only if this process spawned it
- Model name configurable via `OLLAMA_MODEL` env var (default `gemma4:e2b`)

**Main → Python** (`electron/main.js`):
- Dev: `engine/venv/bin/python -m engine.processor`
- Prod: compiled `resources/bin/engine-bin`
- Receives `OLLAMA_HOST` / `OLLAMA_MODEL` env vars so the Python process talks to the same sidecar
- Python communicates back exclusively via **newline-delimited JSON on stdout**: `{"status": "progress"|"completed"|"error"|"warning", ...}`; must call `sys.stdout.flush()` after each line.

**Python engine**:
- `engine/llm_client.py` — `OllamaClient`: stdlib-only HTTP wrapper around Ollama's `/api/generate` (JSON mode, retries) and `/api/tags` (health/model checks)
- `engine/anonymizer.py` — `DocumentAnonymizer`: sends document text to the local LLM with a PII-extraction prompt, resolves returned entity strings back to character offsets (whitespace-tolerant matching, plus regex safety nets for codice fiscale and date of birth), redacts
- `engine/processor.py` — `FolderProcessor`: iterates folder, dispatches to `_process_txt` / `_process_docx` / `_process_pdf`

## Key Design Rules

**PII detection is LLM-only** — no spaCy, no Presidio, no rule-based mode selector. A single prompt (`engine/anonymizer.py:PROMPT_TEMPLATE`) asks the model for entities as JSON. There is no `default`/`aggressive` mode distinction anymore — the model handles context (e.g. distinguishing a person's name from a street named after them) that the old heuristic pipeline couldn't.

**The prompt is few-shot + structured CoT, and both parts are load-bearing.** The model must fill an `"analysis"` field (candidate-by-candidate include/exclude reasoning) before `"entities"`, and the prompt carries three worked examples. Without them, the 2B model reproducibly returned zero entities on short single-sentence documents (verified 3/3, not sampling variance) — the long exclusion list over-suppressed everything when context was minimal. `analyze_and_filter` reads only `entities`; `analysis` is deliberately ignored. Don't "simplify" the prompt by stripping the examples or the analysis field. Also: `PROMPT_TEMPLATE` is a `%`-format string — any literal `%` added to the template (like the `IVA 22%%` example) must be escaped as `%%`, or every call dies with `TypeError: not enough arguments for format string`. Document text substituted in as the argument needs no escaping.

**Detected entity types** (`VALID_TYPES` / `REPLACEMENTS` in `engine/anonymizer.py`): `PERSON`, `ADDRESS`, `PHONE`, `EMAIL`, `FISCAL_ID` (codice fiscale + partita IVA), `ORG`, `DATE_OF_BIRTH`, `IBAN`, `ID_DOCUMENT`, `LICENSE_PLATE`. Adding a new category means updating all three of `VALID_TYPES`, `REPLACEMENTS`, and the prompt's entity list + `NON segnalare MAI` exclusions in one place — they're not independently sourced.

**Italian-only by design (for now)**: the constraint is architectural, not cosmetic — the prompt is written in Italian and instructs on Italian formats, the codice fiscale regex is an Italian-specific format, the date-of-birth safety net anchors on Italian labels ("Data Nascita", "nato il"), and ADDRESS detection keys on via/piazza/corso. The underlying model is multilingual, but on non-Italian documents the safety nets never fire and prompt guidance doesn't apply — results are untested and expected to be worse. Supporting another language means localizing the prompt + both regex nets together, then building a test corpus for it (see `scripts/generate_test_corpus.py`).

**Regex safety nets** (`engine/anonymizer.py`): two categories get a deterministic backstop merged in alongside the LLM's own results, before overlap resolution. Both are narrow, deliberate exceptions to "LLM-only" — not a reopening of Presidio-style broad heuristics:
- `_regex_fiscal_codes` / `_FISCAL_CODE_RE`: codice fiscale is a fixed, checksummable 16-char format. The LLM occasionally misses it outright even at `temperature=0` (CPU-quantized inference isn't perfectly deterministic run-to-run), so the regex alone is sufficient — no context needed.
- `_regex_dates_of_birth` / `_DOB_LABEL_RE` + `_DATE_RE`: dates have no distinctive format of their own, so this one is label-anchored instead — it searches ±60 chars around a "Data Nascita" / "nato il" label (PDF text extraction doesn't preserve visual order, so the label can land before or after its date) and tags any date found there. Added after a real multi-date lab report (refertazione/richiesta/prelievo/firma dates alongside the actual birth date) reliably tricked the LLM into tagging the wrong date — verified reproducible, not sampling variance: the model got an isolated snippet with just the birth date right, but consistently missed it once surrounded by 3-4 other document dates. This is intentionally over-inclusive (it may tag non-birth dates near a coincidental label match too) — for a redaction tool, over-redacting a date is a much smaller cost than missing real PII.

Don't extend either pattern to fuzzy judgment categories like `PERSON` or `ORG` — only to other cases with either a genuinely fixed format (like codice fiscale) or a reliable nearby label to anchor on (like date of birth).

**Offset resolution**: the LLM returns entity text, not reliable character offsets, and it tends to normalize whitespace when reproducing text (e.g. collapsing a column-layout PDF's `"BELFIORE   DANIELE"` into `"BELFIORE DANIELE"`). `DocumentAnonymizer._resolve_offsets` matches with whitespace runs in the LLM's string relaxed to `\s+` against the source (`_flexible_whitespace_pattern`) rather than an exact `str.find`, so this normalization doesn't silently drop real matches. It still finds every occurrence of each returned string (so a name mentioned twice gets redacted both times), and `_dedupe_overlaps` keeps the longest span on overlaps.

**PDF redaction**: always call `page.apply_redactions()` after `add_redact_annot` — this physically removes data from the PDF stream.

**Offline constraint**: no data leaves the machine. The LLM call is local HTTP to `127.0.0.1:11434` (Ollama), never a network request. The model itself is downloaded once (user-triggered, via `pull-engine-model`) and cached under Ollama's local model store afterwards.

**Known limitation / debugging approach**: not every apparent miss is LLM non-determinism — some are reproducible bugs. Before assuming "the model just got unlucky," call `OllamaClient.generate_json` directly with the exact input 2-3 times: if the wrong (or missing) result repeats consistently, it's a prompt gap worth fixing (e.g. the LICENSE_PLATE/DATE_OF_BIRTH type-confusion caught this way — a plate near a "nato il" label was reliably mistagged as a date, 3/3 runs, fixed by an explicit prompt disambiguation), not something a retry or a temperature tweak will paper over. Also test any suspected date/offset issue on both the full document (where multiple similar values compete for the same label) and an isolated snippet — a document that fails whole but succeeds isolated points at context-crowding, not a fundamental misunderstanding.
