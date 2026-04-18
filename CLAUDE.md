# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development

```bash
npm run dev          # Start Vite dev server + Electron together
```

Python engine setup (one-time):
```bash
cd engine
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m spacy download it_core_news_lg
```

Test the Python engine directly (no Electron needed):
```bash
cd engine && source venv/bin/activate
python -m engine.processor --input ../test_input --output ../test_output --mode default
```

### Build

```bash
npm run build:vite      # Build React frontend → dist/
npm run build           # Full build: Vite + electron-builder → dist_electron/
```

Production builds require the compiled Python binary (`resources/bin/engine-bin`). CI generates it via PyInstaller (see `.github/workflows/release.yml`). For local production testing, build it manually:
```bash
cd engine && source venv/bin/activate
pyinstaller --onefile --name engine-bin --collect-all spacy --collect-all it_core_news_lg \
  --collect-all presidio_analyzer --collect-all presidio_anonymizer \
  --distpath ../resources/bin engine/processor.py
```

### Release

Push a version tag — CI builds and publishes installers for all platforms automatically:
```bash
git tag v1.2.3 && git push origin v1.2.3
```

## Architecture

Three isolated layers communicating via IPC:

```
React UI (renderer)  ──IPC──►  Electron main  ──spawn──►  Python sidecar
  src/App.tsx              electron/main.js             engine/processor.py
  src/electron.d.ts        electron/preload.js          engine/anonymizer.py
```

**Renderer → Main IPC** (bridged in `preload.js`, typed in `src/electron.d.ts`):
- `select-folder` — OS folder picker
- `start-anonymization` — spawns Python, streams `progress-update` events back via `webContents.send`
- `open-folder` / `open-external` / `get-app-version`

**Main → Python** (`electron/main.js:115`):
- Dev: `engine/venv/bin/python -m engine.processor`
- Prod: compiled `resources/bin/engine-bin`
- Python communicates back exclusively via **newline-delimited JSON on stdout**: `{"status": "progress"|"completed"|"error"|"warning", ...}`; must call `sys.stdout.flush()` after each line.

**Python engine**:
- `engine/anonymizer.py` — `DocumentAnonymizer`: loads spaCy `it_core_news_lg` + Presidio, runs NER, applies heuristics, resolves overlapping spans
- `engine/processor.py` — `FolderProcessor`: iterates folder, dispatches to `_process_txt` / `_process_docx` / `_process_pdf`

## Key Design Rules

**NLP heuristics** (in `anonymizer.analyze_and_filter`):
- `PERSON` and `LOCATION` only redacted if spaCy finds a `PROPN` token in the span
- Uppercase acronyms (1–4 chars) are always skipped — prevents redacting clinical codes (HGB, RBC, IVA)
- Entities followed by `:`, `%`, `<`, `>`, `=`, or a number are treated as key-value labels and skipped

**Anonymization modes**:
- `default` — names (2+ words only), fiscal IDs, street addresses (requires via/piazza/corso/etc.), phones
- `aggressive` — includes single-word names and emails

**PDF redaction**: always call `page.apply_redactions()` after `add_redact_annot` — this physically removes data from the PDF stream.

**Offline constraint**: the engine must never require a network connection at processing time.

