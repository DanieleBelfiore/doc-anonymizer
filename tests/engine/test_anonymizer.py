import pytest

from engine.anonymizer import DocumentAnonymizer, Entity
from engine.llm_client import OllamaError


class FakeClient:
    def __init__(self, payload=None, error=None):
        self.payload = payload if payload is not None else {"entities": []}
        self.error = error
        self.prompts = []

    def generate_json(self, prompt):
        self.prompts.append(prompt)
        if self.error:
            raise self.error
        return self.payload


def make(entities):
    return DocumentAnonymizer(FakeClient({"analysis": "ignored", "entities": entities}))


def test_empty_text_skips_the_llm():
    client = FakeClient()
    assert DocumentAnonymizer(client).analyze_and_filter("   ") == []
    assert client.prompts == []


def test_llm_failure_becomes_runtime_error():
    anonymizer = DocumentAnonymizer(FakeClient(error=OllamaError("down")))
    with pytest.raises(RuntimeError, match="LLM call failed"):
        anonymizer.analyze_and_filter("Mario Rossi")


def test_document_text_with_percent_signs_reaches_the_prompt():
    client = FakeClient()
    DocumentAnonymizer(client).analyze_and_filter("IVA 22% applicata")
    assert "IVA 22% applicata" in client.prompts[0]


def test_non_dict_payload_yields_no_llm_entities():
    assert DocumentAnonymizer(FakeClient(["not", "a", "dict"])).analyze_and_filter("testo") == []


def test_every_occurrence_is_redacted_and_whitespace_is_tolerated():
    text = "BELFIORE   DANIELE firma. Poi BELFIORE DANIELE ancora."
    result = make([{"text": "BELFIORE DANIELE", "type": "person"}]).anonymize(text)
    assert result == "[NAME] firma. Poi [NAME] ancora."


def test_invalid_entities_are_ignored():
    entities = ["junk", {"text": "", "type": "PERSON"}, {"text": "Roma", "type": "CITY"}, {"type": "PERSON"}]
    assert make(entities).analyze_and_filter("Vivo a Roma") == []


def test_fiscal_code_regex_wins_over_a_mislabelled_llm_span():
    text = "CF: rssmra80a01h501z"
    spans = make([{"text": "rssmra80a01h501z", "type": "ADDRESS"}]).analyze_and_filter(text)
    assert spans == [Entity(start=4, end=20, entity_type="FISCAL_ID", score=2.0)]


def test_date_of_birth_is_found_on_either_side_of_its_label():
    text = "12/03/1980 Data di Nascita. Referto del 01/02/2025 per Mario, nato il 4.5.79"
    dates = [text[e.start:e.end] for e in make([]).analyze_and_filter(text) if e.entity_type == "DATE_OF_BIRTH"]
    assert "12/03/1980" in dates and "4.5.79" in dates


def test_overlaps_keep_the_longest_span():
    spans = DocumentAnonymizer._dedupe_overlaps([
        Entity(0, 5, "PERSON"), Entity(0, 11, "PERSON"), Entity(3, 6, "ORG"), Entity(20, 25, "PHONE"),
    ])
    assert spans == [Entity(0, 11, "PERSON"), Entity(20, 25, "PHONE")]


def test_anonymize_without_entities_returns_text_unchanged():
    assert make([]).anonymize("niente da nascondere") == "niente da nascondere"


def test_unknown_entity_type_gets_a_generic_placeholder():
    assert make([]).anonymize("abc segreto", [Entity(4, 11, "OTHER")]) == "abc [REDACTED]"
