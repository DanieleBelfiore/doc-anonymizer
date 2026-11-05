import json

import fitz
from docx import Document

from engine import processor
from engine.anonymizer import DocumentAnonymizer
from engine.processor import FolderProcessor


class FakeClient:
    """Returns the same PII strings for every call, like a model that always finds them."""

    def __init__(self, *names):
        self.entities = [{"text": n, "type": "PERSON"} for n in names]

    def generate_json(self, prompt):
        return {"entities": self.entities}


def folder_processor(*names):
    return FolderProcessor(DocumentAnonymizer(FakeClient(*names)))


def events(capsys):
    return [json.loads(line) for line in capsys.readouterr().out.splitlines()]


def test_txt_is_redacted(tmp_path):
    src, dst = tmp_path / "in.txt", tmp_path / "out.txt"
    src.write_text("Gentile Mario Rossi,\nsaluti.", encoding="utf-8")
    folder_processor("Mario Rossi")._process_txt(src, dst)
    assert dst.read_text(encoding="utf-8") == "Gentile [NAME],\nsaluti."


def test_docx_redacts_across_runs_paragraphs_and_tables(tmp_path):
    src, dst = tmp_path / "in.docx", tmp_path / "out.docx"
    doc = Document()
    p = doc.add_paragraph("Il sig. ")
    p.add_run("Mario ").bold = True
    p.add_run("Rossi firma.")
    doc.add_paragraph("   ")
    doc.add_table(rows=1, cols=1).cell(0, 0).text = "Referente: Anna Bruni"
    doc.save(src)

    folder_processor("Mario Rossi", "Anna Bruni")._process_docx(src, dst)

    out = Document(dst)
    assert out.paragraphs[0].text == "Il sig. [NAME] firma."
    assert out.paragraphs[0].runs[1].bold  # formatting of the first touched run survives
    assert out.tables[0].cell(0, 0).text == "Referente: [NAME]"


def test_docx_without_text_is_copied(tmp_path):
    src, dst = tmp_path / "in.docx", tmp_path / "out.docx"
    Document().save(src)
    folder_processor()._process_docx(src, dst)
    assert dst.exists()


def test_pdf_text_is_removed(tmp_path):
    src, dst = tmp_path / "in.pdf", tmp_path / "out.pdf"
    doc = fitz.open()
    doc.new_page().insert_text((72, 72), "Paziente Mario Rossi, visita di controllo.")
    doc.save(src)

    folder_processor("Mario Rossi")._process_pdf(src, dst)

    with fitz.open(dst) as out:
        text = out[0].get_text()
    assert "Mario Rossi" not in text and "visita di controllo" in text


def test_scanned_pdf_goes_through_ocr(tmp_path, monkeypatch):
    src, dst = tmp_path / "in.pdf", tmp_path / "out.pdf"
    doc = fitz.open()
    doc.new_page()
    doc.save(src)
    ocr = {"text": ["Mario", "Rossi", ""], "left": [10, 60, 0], "top": [10, 10, 0], "width": [40, 40, 0], "height": [12, 12, 0]}
    monkeypatch.setattr(processor.pytesseract, "image_to_data", lambda *a, **k: ocr)
    redacted = []
    original = fitz.Page.add_redact_annot
    monkeypatch.setattr(fitz.Page, "add_redact_annot", lambda self, rect, **k: redacted.append(rect) or original(self, rect, **k))

    folder_processor("Mario Rossi")._process_pdf(src, dst)

    assert len(redacted) == 2 and dst.exists()


def test_process_folder_reports_progress_warnings_and_completion(tmp_path, capsys):
    src, dst = tmp_path / "in", tmp_path / "out"
    src.mkdir()
    (src / "a.txt").write_text("Mario Rossi", encoding="utf-8")
    (src / "broken.pdf").write_text("not a pdf")
    (src / "notes.md").write_text("skipped")

    folder_processor("Mario Rossi").process_folder(str(src), str(dst))

    out = events(capsys)
    assert {e["status"] for e in out} == {"progress", "warning", "completed"}
    assert next(e for e in out if e["status"] == "warning")["file"] == "broken.pdf"
    assert out[-1] == {"status": "completed"}
    assert (dst / "a.txt").read_text(encoding="utf-8") == "[NAME]"
    assert not (dst / "notes.md").exists()


def test_process_folder_errors(tmp_path, capsys):
    folder_processor().process_folder(str(tmp_path / "missing"), str(tmp_path / "out"))
    folder_processor().process_folder(str(tmp_path), str(tmp_path / "out"))
    assert [e["message"] for e in events(capsys)] == [
        f"Input folder not found: {tmp_path / 'missing'}",
        "No supported files found",
    ]
