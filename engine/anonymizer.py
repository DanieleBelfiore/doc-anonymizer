from presidio_analyzer import AnalyzerEngine, RecognizerRegistry, PatternRecognizer, Pattern
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig
from presidio_analyzer.nlp_engine import NlpEngineProvider

class ItalianFiscalCodesRecognizer(PatternRecognizer):
    def __init__(self):
        patterns = [
            Pattern(name="CodiceFiscale", regex=r"\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b", score=1.0),
            # Base score 0.3 stays below the 0.4 threshold for standalone 11-digit numbers.
            # Presidio boosts to ~0.65 when context keywords appear nearby.
            Pattern(name="PartitaIva", regex=r"\b\d{11}\b", score=0.3),
        ]
        super().__init__(
            supported_entity="FISCAL_ID",
            patterns=patterns,
            supported_language="it",
            context=["partita", "iva", "piva", "p.iva", "fiscale"],
        )

class DocumentAnonymizer:
    def __init__(self, language="it"):
        self.language = language
        configuration = {
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "it", "model_name": "it_core_news_lg"}],
        }
        
        try:
            provider = NlpEngineProvider(nlp_configuration=configuration)
            self.nlp_engine = provider.create_engine()
            self.spacy_model = self.nlp_engine.nlp["it"]
        except Exception as e:
            raise RuntimeError(f"Failed to load NLP engine: {e}")
        
        registry = RecognizerRegistry()
        registry.load_predefined_recognizers(nlp_engine=self.nlp_engine)
        registry.add_recognizer(ItalianFiscalCodesRecognizer())
        
        self.analyzer = AnalyzerEngine(
            nlp_engine=self.nlp_engine, 
            registry=registry,
            default_score_threshold=0.4
        )
        self.anonymizer = AnonymizerEngine()
        
        self.operators = {
            "PERSON": OperatorConfig("replace", {"new_value": "[NAME]"}),
            "PHONE_NUMBER": OperatorConfig("replace", {"new_value": "[PHONE]"}),
            "LOCATION": OperatorConfig("replace", {"new_value": "[ADDRESS]"}),
            "FISCAL_ID": OperatorConfig("replace", {"new_value": "[FISCAL_ID]"}),
            "EMAIL_ADDRESS": OperatorConfig("replace", {"new_value": "[EMAIL]"}),
        }

    def analyze_and_filter(self, text, mode="default"):
        """Centralized logic to find and filter PII candidates based on heuristics and linguistics."""
        if not text.strip():
            return []
            
        doc = self.spacy_model(text)
        
        # Email is always included in both modes
        target_entities = ["PERSON", "PHONE_NUMBER", "LOCATION", "FISCAL_ID", "EMAIL_ADDRESS"]
        
        results = self.analyzer.analyze(text=text, language=self.language, entities=target_entities)
        
        filtered_results = []
        for res in results:
            span = doc.char_span(res.start, res.end, alignment_mode="expand")
            if not span: continue
            
            entity_text = span.text

            # 1. HEURISTIC: Skip short acronyms (1-4 caps)
            if all(t.text.isupper() and len(t.text) <= 4 for t in span):
                continue

            # 2. HEURISTIC: Key-Value Detection (Labels)
            if span.end < len(doc):
                next_t = doc[span.end]
                if next_t.text in [":", "%", "<", ">", "="] or next_t.like_num:
                    continue

            # 3. MODE SPECIFIC LOGIC
            if mode == "default":
                # Strict Person Rule: only redact if it looks like Name + Surname
                if res.entity_type == "PERSON":
                    words = [t for t in span if t.text.isalpha()]
                    if len(words) < 2:
                        continue
                
                # Street Address Only
                if res.entity_type == "LOCATION":
                    address_indicators = ["via", "viale", "piazza", "corso", "vicolo", "strada"]
                    if not any(ind in entity_text.lower() for ind in address_indicators):
                        continue

            # 4. LINGUISTIC VALIDATION: PERSON and LOCATION must contain at least one PROPN
            if res.entity_type in ["PERSON", "LOCATION"]:
                if not any(t.pos_ == "PROPN" for t in span):
                    continue

            filtered_results.append(res)
        
        return self._resolve_overlaps(filtered_results)

    def anonymize(self, text, mode="default", entities=None):
        """Replace detected PII with placeholders. Pass pre-computed entities to skip NLP analysis."""
        filtered_results = entities if entities is not None else self.analyze_and_filter(text, mode=mode)
        return self.anonymizer.anonymize(
            text=text,
            analyzer_results=filtered_results,
            operators=self.operators,
        ).text

    def _resolve_overlaps(self, results):
        results.sort(key=lambda x: x.start)
        if not results: return []
        final = []
        current = results[0]
        for next_res in results[1:]:
            if next_res.start < current.end:
                if next_res.score > current.score:
                    current = next_res
            else:
                final.append(current)
                current = next_res
        final.append(current)
        return final
