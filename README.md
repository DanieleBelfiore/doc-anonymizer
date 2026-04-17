# 🛡️ Doc Anonymizer

![image](image.png)

**Doc Anonymizer** is a professional, local-first desktop application designed to automatically redact sensitive information from documents while preserving their structure and clinical/technical utility. 

Built with privacy in mind, all processing happens **100% offline** on your machine. No data ever leaves your computer.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Tech](https://img.shields.io/badge/tech-React%20%7C%20Electron%20%7C%20Python-green)
[![Latest Release](https://img.shields.io/github/v/release/DanieleBelfiore/doc-anonymizer?label=Latest%20Version)](https://github.com/DanieleBelfiore/doc-anonymizer/releases)

## 📥 Quick Download (For End Users)

> [!IMPORTANT]
> **Current Language Support**: This application is currently optimized and configured exclusively for **Italian** documents. Supported PII detection (Names, Addresses, Fiscal Codes) is tuned for the Italian language and legal formats.

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
- **Linguistic Intelligence**: Powered by `spaCy` (Large Italian Model), using grammatical analysis to protect PII without destroying technical data.
- **Dual Processing Modes**:
  - 🟢 **Default**: Surgical redaction. Focuses only on Names, Fiscal Codes (CF/PIVA), Street Addresses, Phone Numbers, and Emails.
  - 🔴 **Aggressive**: Stricter detection for maximum security.
- **100% Privacy**: No cloud APIs, no internet required. Your documents stay on your hard drive.

---

## 🏗️ Architecture

The app uses a hybrid architecture to ensure cross-platform compatibility:
1.  **Frontend**: React 19 + Tailwind CSS 4.
2.  **Shell**: Electron 41.
3.  **Engine**: A Python 3 sidecar process for high-performance NLP.

---

## 👩‍💻 For Developers (Building from source)

If you want to contribute or build the app yourself, follow these steps:

### Prerequisites
- **Node.js** (v25+)
- **Python** (v3.14+)
- **Tesseract OCR**: Required for scanned document support.

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
    python -m spacy download it_core_news_lg
    cd ..
    ```
3.  **Run Development Mode**:
    ```bash
    npm run dev
    ```

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

***

**Created with ❤️ for Privacy.**
