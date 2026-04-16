import fitz
from engine.anonymizer import DocumentAnonymizer

def debug_pdf_mode(file_path, mode="default"):
    print(f"--- Diagnostic: {file_path} [MODE: {mode.upper()}] ---")
    engine = DocumentAnonymizer()
    doc = fitz.open(file_path)
    
    for page_num, page in enumerate(doc):
        print(f"\n--- Page {page_num + 1} ---")
        text = page.get_text("text")
        if not text.strip(): continue
            
        spacy_doc = engine.spacy_model(text)
        
        # We manually simulate the logic in anonymize() for visibility
        target_entities = ["PERSON", "PHONE_NUMBER", "LOCATION", "FISCAL_ID", "EMAIL_ADDRESS"]
        results = engine.analyzer.analyze(text=text, language=engine.language, entities=target_entities)
        
        print(f"{'Text':<30} | {'Entity':<12} | {'Decision'}")
        print("-" * 60)
        
        filtered = []
        for res in results:
            span = spacy_doc.char_span(res.start, res.end, alignment_mode="expand")
            if not span: continue
            
            entity_text = span.text
            decision = "REDACT"

            # 1. Acronyms
            if all(t.text.isupper() and len(t.text) <= 4 for t in span):
                decision = "SKIP (Acronym)"
            
            # 2. Key-Value
            elif span.end < len(spacy_doc) and (spacy_doc[span.end].text in [":", "%", "<", ">", "="] or spacy_doc[span.end].like_num):
                decision = "SKIP (Label)"
                
            # 3. Default Mode Specifics
            elif mode == "default":
                if res.entity_type == "PERSON":
                    words = [t for t in span if t.text.isalpha()]
                    if len(words) < 2:
                        decision = "SKIP (Single Word Name)"
                elif res.entity_type == "LOCATION":
                    address_indicators = ["via", "viale", "piazza", "corso", "vicolo", "strada"]
                    if not any(ind in entity_text.lower() for ind in address_indicators):
                        decision = "SKIP (Not an Address)"
            
            # 4. Linguistic
            if decision == "REDACT" and res.entity_type in ["PERSON", "LOCATION"]:
                if not any(t.pos_ == "PROPN" for t in span):
                    decision = "SKIP (Not Proper Noun)"

            print(f"{entity_text[:30]:<30} | {res.entity_type:<12} | {decision}")

if __name__ == "__main__":
    debug_pdf_mode("test_input/2025-05-16.pdf", mode="default")
