import fitz
from engine.anonymizer import DocumentAnonymizer

def debug_generic(file_path):
    print(f"--- Debugging Generic Logic: {file_path} ---")
    engine = DocumentAnonymizer()
    doc = fitz.open(file_path)
    
    for page_num, page in enumerate(doc):
        print(f"\n--- Page {page_num + 1} ---")
        text = page.get_text("text")
        if not text.strip(): continue
            
        spacy_doc = engine.spacy_model(text)
        results = engine.analyzer.analyze(text=text, language=engine.language, entities=list(engine.operators.keys()))
        
        print(f"{'Text':<30} | {'Entity':<12} | {'POS':<15} | {'Decision'}")
        print("-" * 90)
        
        for res in results:
            val = text[res.start:res.end].replace('\n', ' ')
            entity_span = spacy_doc.char_span(res.start, res.end, alignment_mode="expand")
            
            decision = "KEEP (Redact)"
            pos_tags = "N/A"
            
            if not entity_span:
                decision = "SKIP (No span)"
            else:
                pos_tags = ", ".join([t.pos_ for t in entity_span])
                is_proper_noun = any(t.pos_ == "PROPN" for t in entity_span)
                is_structural = res.entity_type in ["EMAIL_ADDRESS", "PHONE_NUMBER", "IP_ADDRESS", "URL"]
                is_technical = all(t.text.isupper() and len(t.text) <= 4 for t in entity_span)
                
                if not (is_proper_noun or is_structural):
                    decision = "SKIP (Not PROPN)"
                elif is_technical:
                    decision = "SKIP (Tech Code)"
                
                last_token = entity_span[-1]
                if last_token.i + 1 < len(spacy_doc):
                    next_t = spacy_doc[last_token.i + 1]
                    if next_t.text == ":" or next_t.like_num or next_t.text in ["%", "<", ">", "="]:
                        decision = "SKIP (Context)"

            print(f"{val[:30]:<30} | {res.entity_type:<12} | {pos_tags:<15} | {decision}")

if __name__ == "__main__":
    debug_generic("test_input/2025-05-16.pdf")
