import os
import sys
import argparse
import json
from pathlib import Path
from docx import Document
import fitz  # PyMuPDF
import pytesseract
from PIL import Image
import io
from engine.anonymizer import DocumentAnonymizer

class FolderProcessor:
    def __init__(self, anonymizer: DocumentAnonymizer, mode="default"):
        self.anonymizer = anonymizer
        self.mode = mode
        self.supported_extensions = {".txt", ".docx", ".pdf"}

    def process_folder(self, input_path: str, output_path: str):
        input_dir = Path(input_path)
        output_dir = Path(output_path)
        output_dir.mkdir(parents=True, exist_ok=True)

        files = [f for f in input_dir.iterdir() if f.suffix.lower() in self.supported_extensions]
        total_files = len(files)
        
        if total_files == 0:
            print(json.dumps({"status": "error", "message": "No supported files found"}))
            return

        for i, file_path in enumerate(files):
            try:
                target_path = output_dir / file_path.name
                if file_path.suffix.lower() == ".txt":
                    self._process_txt(file_path, target_path)
                elif file_path.suffix.lower() == ".docx":
                    self._process_docx(file_path, target_path)
                elif file_path.suffix.lower() == ".pdf":
                    self._process_pdf(file_path, target_path)
                
                progress = int(((i + 1) / total_files) * 100)
                print(json.dumps({
                    "status": "progress", "current": i + 1, "total": total_files, 
                    "percentage": progress, "file": str(file_path.name)
                }))
                sys.stdout.flush()
            except Exception as e:
                print(json.dumps({"status": "warning", "file": str(file_path.name), "error": str(e)}))
                sys.stdout.flush()

        print(json.dumps({"status": "completed"}))

    def _process_txt(self, input_file: Path, output_file: Path):
        with open(input_file, "r", encoding="utf-8") as f:
            content = f.read()
        anonymized_content = self.anonymizer.anonymize(content, mode=self.mode)
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(anonymized_content)

    def _process_docx(self, input_file: Path, output_file: Path):
        doc = Document(input_file)
        
        def anonymize_paragraphs(paragraphs):
            for paragraph in paragraphs:
                if not paragraph.text.strip():
                    continue
                
                entities = self.anonymizer.analyze_and_filter(paragraph.text, mode=self.mode)
                if not entities:
                    continue

                original_text = paragraph.text
                anonymized_text = self.anonymizer.anonymize(original_text, entities=entities)
                
                if original_text != anonymized_text:
                    # Clear runs and set text to preserve paragraph-level properties
                    p_element = paragraph._p
                    for run in paragraph.runs:
                        run.text = ""
                    if paragraph.runs:
                        paragraph.runs[0].text = anonymized_text
                    else:
                        paragraph.add_run(anonymized_text)

        anonymize_paragraphs(doc.paragraphs)
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    anonymize_paragraphs(cell.paragraphs)
                    
        doc.save(output_file)

    def _process_pdf(self, input_file: Path, output_file: Path):
        doc = fitz.open(input_file)
        try:
            for page in doc:
                text = page.get_text("text")

                filtered = self.anonymizer.analyze_and_filter(text, mode=self.mode)

                # Fallback to OCR if page seems scanned
                if not filtered and len(text.strip()) < 10:
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                    img = Image.open(io.BytesIO(pix.tobytes()))
                    ocr_data = pytesseract.image_to_data(img, lang='ita', output_type=pytesseract.Output.DICT)
                    ocr_text = " ".join([w for w in ocr_data['text'] if w.strip()])

                    ocr_entities = self.anonymizer.analyze_and_filter(ocr_text, mode=self.mode)

                    for res in ocr_entities:
                        target_words = ocr_text[res.start:res.end].split()
                        for target_word in target_words:
                            for i, word in enumerate(ocr_data['text']):
                                if target_word in word:
                                    x, y, w, h = ocr_data['left'][i], ocr_data['top'][i], ocr_data['width'][i], ocr_data['height'][i]
                                    rect = fitz.Rect(x/2, y/2, (x+w)/2, (y+h)/2)
                                    page.add_redact_annot(rect, fill=(0, 0, 0))
                else:
                    for res in filtered:
                        target_text = text[res.start:res.end]
                        for inst in page.search_for(target_text):
                            page.add_redact_annot(inst, fill=(0, 0, 0))

                page.apply_redactions()

            doc.save(output_file, garbage=4, deflate=True)
        finally:
            doc.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Anonymize documents.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--mode", default="default", choices=["default", "aggressive"])
    args = parser.parse_args()
    
    try:
        engine = DocumentAnonymizer()
        processor = FolderProcessor(engine, mode=args.mode)
        processor.process_folder(args.input, args.output)
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)
