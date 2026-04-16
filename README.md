# 🛡️ Doc Anonymizer

**Doc Anonymizer** is a professional, local-first desktop application designed to automatically redact sensitive information from documents while preserving their structure and clinical/technical utility. 

Built with privacy in mind, all processing happens **100% offline** on your machine. No data ever leaves your computer.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Tech](https://img.shields.io/badge/tech-React%20%7C%20Electron%20%7C%20Python-green)

## ✨ Key Features

- **Multi-Format Support**: Anonymize `.pdf` (both native and scanned), `.docx`, and `.txt` files.
- **Deep OCR Integration**: Uses Tesseract OCR to "read" and redact scanned PDFs and images of documents.
- **Linguistic Intelligence**: Powered by `spaCy` (Large Italian Model) and `Microsoft Presidio`, using Part-of-Speech analysis rather than simple keyword lists to distinguish between personal names and technical terms.
- **Dual Processing Modes**:
  - 🟢 **Default**: Surgical redaction. Focuses only on Names, Fiscal Codes (CF/PIVA), Street Addresses, Phone Numbers, and Emails. It is designed to ignore clinical terms, medical tests, and document labels.
  - 🔴 **Aggressive**: Stricter detection. Redacts anything that has even a slight probability of being personal data.
- **Modern UI**: A sleek, "Glassmorphic" interface with real-time progress tracking.
- **Cross-Platform**: Runs on Windows, macOS, and Linux.

## 🏗️ Architecture

The app uses a hybrid architecture to combine UI flexibility with heavy-duty NLP processing:

1.  **Frontend**: React 19 + Tailwind CSS 4 for a responsive, modern interface.
2.  **Shell**: Electron 35 managing native OS features (File Explorer integration, Windowing).
3.  **Engine**: A Python 3 sidecar process running a dedicated Virtual Environment for high-performance NLP and PDF manipulation.

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18 or higher)
- **Python** (v3.9 or higher)
- **Tesseract OCR**: Required for scanned document support.
  - *macOS*: `brew install tesseract tesseract-lang`
  - *Windows*: Download and install from [UB Mannheim](https://github.com/UB-Mannheim/tesseract/wiki).
  - *Linux*: `sudo apt install tesseract-ocr`

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/YourUsername/doc-anonymizer.git
    cd doc-anonymizer
    ```

2.  **Setup the Python Engine**:
    ```bash
    cd engine
    python3 -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    pip install -r requirements.txt
    python -m spacy download it_core_news_lg
    cd ..
    ```

3.  **Install Node dependencies**:
    ```bash
    npm install
    ```

### Development

To start the application in development mode:
```bash
npm run dev
```

## 🛠️ Usage

1.  **Source Folder**: Select the folder containing the documents you want to clean.
2.  **Destination Folder**: Select where you want to save the anonymized versions.
3.  **Choose Mode**: 
    - Use **Default** for medical reports or technical invoices to keep the content readable.
    - Use **Aggressive** for maximum security.
4.  **Start Batch**: Click the button and watch the real-time progress bar.

## 🔒 Privacy

This application is **Offline-Only**. 
- It does not require an internet connection.
- It does not use any Cloud AI APIs.
- Your documents stay on your hard drive. 
- The redaction process physically removes data from PDF layers (it doesn't just put a black box on top).

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

***

**Created with ❤️ for Privacy.**
