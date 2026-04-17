# 🛡️ Doc Anonymizer - Project Context

This document serves as the foundational instructional context for Gemini CLI when working on the **Doc Anonymizer** project.

## 📖 Project Overview
Doc Anonymizer is a **local-first** desktop application designed to redact sensitive personal information (PII) from documents (`.pdf`, `.docx`, `.txt`) while preserving their clinical and technical utility.

### Core Technologies
- **Frontend**: React 19, Tailwind CSS 4, Lucide React icons.
- **Shell**: Electron 41 (managing OS integration and IPC).
- **Engine (Sidecar)**: Python 3.14 using `spacy` (Large Italian Model) and `presidio-analyzer`/`presidio-anonymizer`.
- **PDF Handling**: `PyMuPDF` (fitz) for redaction and `Tesseract OCR` for scanned documents.
- **CI/CD**: GitHub Actions for automated cross-platform releases (Windows, macOS, Linux).

### Architecture
1. **Renderer Process (React)**: Handles the UI, folder selection, and progress monitoring.
2. **Main Process (Electron)**: Bridges the UI with the OS. It spawns the Python process as a sidecar.
3. **Engine Process (Python)**: Executes the heavy NLP and file manipulation. In production, this is a compiled binary (`engine-bin`) bundled with the app.

---

## 🚀 Building and Running

### Development
- **Start App**: `npm run dev` (Starts Vite dev server and Electron).
- **Python Setup**:
  ```bash
  cd engine
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt
  python -m spacy download it_core_news_lg
  ```

### Production Build
- **Build All**: `npm run build`
- **Release (CI)**: Triggered by pushing a version tag (e.g., `git tag v1.0.0 && git push origin v1.0.0`).

---

## 🛠️ Development Conventions

### Language and Style
- **Code Language**: ALL code (variables, comments, logs) and UI strings must be in **English**.
- **Anonymization Scope**: Currently optimized for the **Italian** language and legal formats.

### NLP and Filtering Logic
- **Heuristic-First**: Favor linguistic intelligence over hard-coded whitelists.
- **Proper Noun Rule**: `PERSON` and `LOCATION` entities are only redacted if SpaCy identifies at least one Proper Noun (`PROPN`) within the span.
- **Key-Value Awareness**: Entities followed by a colon (`:`), numeric value, or math symbol (%, <, >, =) are treated as "Labels" and are **not** redacted.
- **Acronym Filter**: Isolated uppercase words of 1-4 characters (e.g., RBC, HGB, IVA) are ignored to prevent clinical over-redaction.

### Anonymization Modes
- **Default Mode**: Surgical/Conservative. Focuses on Names (multi-word only), Fiscal IDs, Addresses (with street indicators), and Phone Numbers.
- **Aggressive Mode**: Higher sensitivity, including single-word names and email addresses.

### Safety and Privacy
- **Offline Only**: Never introduce dependencies that require an internet connection or cloud APIs for processing.
- **Physical Redaction**: Ensure PDF redactions use `apply_redactions()` to physically remove data from the document stream.

---

## 📂 Key Files
- `electron/main.js`: Contains the `spawn` logic for the Python sidecar.
- `engine/anonymizer.py`: Contains the `DocumentAnonymizer` class and filtering heuristics.
- `engine/processor.py`: Contains the `FolderProcessor` and format-specific logic (OCR, PDF redaction).
- `src/App.tsx`: The primary UI dashboard.
- `.github/workflows/release.yml`: The release pipeline configuration.
