# 🛡️ Doc Anonymizer

![image](image.png)

**Doc Anonymizer** is a professional, local-first desktop application designed to automatically redact sensitive information from documents while preserving their structure and clinical/technical utility. 

Built with privacy in mind, all processing happens **100% offline** on your machine. Your documents never leave your computer. (The app only goes online for two optional, document-unrelated tasks: the one-time AI model download and a version check against GitHub Releases at startup.)

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Tech](https://img.shields.io/badge/tech-React%20%7C%20Electron%20%7C%20Python-green)
[![Latest Release](https://img.shields.io/github/v/release/DanieleBelfiore/doc-anonymizer?label=Latest%20Version)](https://github.com/DanieleBelfiore/doc-anonymizer/releases)

## 📥 Quick Download (For End Users)

> [!IMPORTANT]
> **Current Language Support**: This application is currently optimized and configured exclusively for **Italian** documents. PII detection (names, addresses, phone numbers, emails, codice fiscale / partita IVA, organizations, dates of birth, IBANs, ID document numbers, license plates) is tuned for the Italian language and legal formats.

You **do not need to be a developer** to use this application. You can download the ready-to-use installer for your specific operating system:

1.  Go to the [**Releases Page**](https://github.com/DanieleBelfiore/doc-anonymizer/releases).
2.  Download the package for your system:
    -   🪟 **Windows**: `.exe` installer (standard setup).
    -   🍎 **macOS**: `.dmg` package (drag to Applications).
    -   🐧 **Linux**: `.AppImage` (portable executable, runs on most distributions).
3.  Install and run. **No other setup (Node or Python) is required.**

---

## ✨ Key Features

- **Multi-Format Support**: Anonymize `.pdf` (both native and scanned), `.docx`, and `.txt` files.
- **Deep OCR Integration**: Uses Tesseract OCR to "read" and redact scanned PDFs.
- **Local AI Detection**: Powered by a local LLM (via [Ollama](https://ollama.com), default model `gemma4:e2b`) that understands context — e.g. telling a person's name apart from a street named after them — instead of relying on fixed grammar rules.
- **Detects**: names, physical addresses, phone numbers, emails, codice fiscale / partita IVA, organizations, date of birth, IBAN, ID document numbers, and vehicle plates.
- **100% Privacy**: No cloud APIs, no internet required at processing time. The AI model runs entirely on your machine; the only network request ever made is the one-time model download on first launch.

---

## 🏗️ Architecture

The app uses a hybrid architecture to ensure cross-platform compatibility:
1.  **Frontend**: React 19 + Tailwind CSS 4.
2.  **Shell**: Electron 41 — also manages a local **Ollama** sidecar process for AI inference.
3.  **Engine**: A Python 3 sidecar process that extracts text from documents and calls the local AI model to find sensitive data.

---

## 👩‍💻 For Developers (Building from source)

If you want to contribute or build the app yourself, follow these steps:

### Prerequisites
- **Node.js** (v25+)
- **Python** (v3.14+)
- **Tesseract OCR**: Required for scanned document support.
- **[Ollama](https://ollama.com)**: Required for local AI detection.

### Setup
1.  **Clone & Install Node deps**:
    ```bash
    git clone https://github.com/DanieleBelfiore/doc-anonymizer.git
    cd doc-anonymizer
    npm install
    ```
2.  **Setup Python Engine**:
    ```bash
    cd engine
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    cd ..
    ```
3.  **Pull the AI model** (one-time, ~7GB):
    ```bash
    ollama pull gemma4:e2b
    ```
4.  **Run Development Mode**:
    ```bash
    npm run dev
    ```
    The app spawns `ollama serve` automatically if it's not already running.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

***

**Created with ❤️ for Privacy.**
