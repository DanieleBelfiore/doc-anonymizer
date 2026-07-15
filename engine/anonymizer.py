"""LLM-only document anonymizer.

Replaces the previous Presidio + spaCy pipeline. The model (default
`gemma4:e2b` via Ollama) returns PII entity strings as JSON; we resolve
character offsets locally with whitespace-tolerant matching (the model
normalizes whitespace when reproducing text), plus regex safety nets for
codice fiscale and date of birth. See CLAUDE.md "Key Design Rules".
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

from engine.llm_client import OllamaClient, OllamaError


VALID_TYPES = {
    "PERSON", "ADDRESS", "PHONE", "EMAIL", "FISCAL_ID", "ORG",
    "DATE_OF_BIRTH", "IBAN", "ID_DOCUMENT", "LICENSE_PLATE",
}

REPLACEMENTS = {
    "PERSON": "[NAME]",
    "ADDRESS": "[ADDRESS]",
    "PHONE": "[PHONE]",
    "EMAIL": "[EMAIL]",
    "FISCAL_ID": "[FISCAL_ID]",
    "ORG": "[ORG]",
    "DATE_OF_BIRTH": "[DATE_OF_BIRTH]",
    "IBAN": "[IBAN]",
    "ID_DOCUMENT": "[ID_DOCUMENT]",
    "LICENSE_PLATE": "[LICENSE_PLATE]",
}

# Deterministic safety net for Italian codice fiscale: the LLM occasionally
# misses it (run-to-run sampling variance even at temperature=0), but the
# format is fixed and checksummable, so a regex catches it reliably.
# IGNORECASE: rare, but codici fiscali do show up lowercase in sloppy forms.
_FISCAL_CODE_RE = re.compile(r"\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b", re.IGNORECASE)

# Label-anchored safety net for date of birth. On real multi-date documents
# (lab reports with refertazione/richiesta/prelievo/firma dates alongside the
# actual birth date) the LLM reliably confuses which date belongs to which
# label — verified: it gets the isolated snippet right but picks the wrong
# date once surrounded by 3-4 other document dates. A date's own format
# isn't distinctive enough on its own (unlike codice fiscale), so we anchor
# on a nearby label instead: PDF text extraction doesn't always preserve
# visual order, so the label can appear before OR after its date.
_DOB_LABEL_RE = re.compile(
    r"data\s+(?:di\s+)?nascita|nat[oa](?:/a)?\s+il|\bn\.\s*il\b", re.IGNORECASE
)
_DATE_RE = re.compile(r"\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b")
_DOB_SEARCH_WINDOW = 60  # chars on each side of the label

PROMPT_TEMPLATE = """Sei un sistema di rilevamento PII per documenti italiani.
Analizza il testo e restituisci SOLO un oggetto JSON valido, senza commenti.

Identifica solo informazioni personali identificabili reali:
- PERSON: nomi di persone reali (cognome o nome+cognome), incluso il personale sanitario o professionale associato (medico curante, medico consulente, infermiere, referente) anche quando preceduto da un'etichetta di ruolo — l'etichetta di ruolo non va inclusa nella redazione, ma il nome si'. Includi anche nomi scritti TUTTO MAIUSCOLO (es. "Sig. BELFIORE DANIELE" -> "BELFIORE DANIELE"). Riporta il nome ESATTAMENTE nell'ordine in cui appare nel testo, anche se e' nel formato "Cognome Nome" (es. "COLOMBO LAURA" resta "COLOMBO LAURA", non va riordinato in "LAURA COLOMBO"). Non includere titoli (Dr., Avv., Sig.) e non includere nomi che fanno parte di un nome di via.
- ADDRESS: indirizzi fisici completi (via/piazza/corso + nome + numero civico, eventualmente con CAP). Non includere citta' isolate senza contesto postale. Un indirizzo contiene sempre una parola come via/viale/piazza/corso: non confonderlo con un codice fiscale o un altro codice alfanumerico.
- PHONE: numeri di telefono
- EMAIL: indirizzi email
- FISCAL_ID: codici fiscali italiani, sempre nel formato fisso 6 lettere + 2 cifre + 1 lettera + 2 cifre + 1 lettera + 3 cifre + 1 lettera (16 caratteri, es. "RSSMRA80A01H501Z"), oppure partita IVA (11 cifre). Non e' mai un indirizzo.
- ORG: organizzazioni private specifiche (studi legali, aziende). Non includere reparti generici (Cardiologia, Amministrazione).
- DATE_OF_BIRTH: solo la data di nascita, associata a un'etichetta come "Data di Nascita", "Data Nascita", "nato/a il", "n. il". ATTENZIONE: nel testo estratto da PDF l'etichetta puo' comparire PRIMA o DOPO la data (l'ordine del testo estratto non segue sempre l'ordine visivo del documento) — cerca la data vicina a quell'etichetta specifica, in entrambe le direzioni. NON e' la data di refertazione, richiesta, prelievo, check-in, emissione o firma: quelle sono date del documento/pratica, non della persona, e vanno ignorate anche se sembrano vicine al nome.
- IBAN: codici IBAN e numeri di conto corrente bancario.
- ID_DOCUMENT: numero di carta d'identita' o passaporto.
- LICENSE_PLATE: targhe di veicoli italiane (es. formato lettere-numeri-lettere come "FX123GH"). Una targa non e' mai una data, anche se si trova vicino a un'etichetta di data come "nato il".

NON segnalare MAI: titoli professionali, acronimi clinici (HGB, RBC, GLU), la sigla "IVA" come imposta, codici tecnici, valori numerici con unita' di misura, etichette di campo (Nome:, Tel:), numeri di pratica, date diverse dalla data di nascita.

Prima di rispondere, elenca nel campo "analysis" ogni possibile candidato PII trovato nel testo e la tua decisione (includere/escludere e perche'). Poi compila "entities" con i soli candidati inclusi.

Esempi:

Input: "Il paziente Franco Neri e' stato visitato in data 01/03/2025."
Output: {"analysis": "Franco Neri: nome di persona reale -> includo come PERSON. 01/03/2025: data visita, non data di nascita -> escludo.", "entities": [{"text": "Franco Neri", "type": "PERSON"}]}

Input: "Esami: HGB 14.2 g/dL, RBC 5.1. IVA 22%% applicata sui referti."
Output: {"analysis": "HGB, RBC: acronimi clinici -> escludo. IVA: imposta -> escludo. Nessun PII.", "entities": []}

Input: "Anna Bruni ha un appuntamento il 05/06/2026."
Output: {"analysis": "Anna Bruni: nome di persona reale -> includo come PERSON. 05/06/2026: data appuntamento -> escludo.", "entities": [{"text": "Anna Bruni", "type": "PERSON"}]}

Schema output (rispetta esattamente le chiavi):
{"analysis": "elenco candidati e decisioni", "entities": [{"text": "stringa esatta presente nel documento", "type": "PERSON|ADDRESS|PHONE|EMAIL|FISCAL_ID|ORG|DATE_OF_BIRTH|IBAN|ID_DOCUMENT|LICENSE_PLATE"}]}

Se non trovi PII, restituisci {"analysis": "nessun candidato", "entities": []}.

Testo da analizzare:
---
%s
---

Restituisci SOLO il JSON."""


@dataclass(frozen=True)
class Entity:
    """A detected PII span in the source text.

    `score` breaks ties in _dedupe_overlaps: LLM entities default to 1.0,
    regex safety nets use 2.0 so they win when spans coincide.
    """

    start: int
    end: int
    entity_type: str
    score: float = 1.0


class DocumentAnonymizer:
    """LLM-driven anonymizer.

    The constructor no longer loads any model in-process: the heavy lifting
    happens in the Ollama sidecar. We instantiate a thin HTTP client only.
    """

    def __init__(self, client: OllamaClient | None = None):
        self.client = client or OllamaClient()

    # ---- public API (kept compatible with processor.py) ----

    def analyze_and_filter(self, text: str) -> list[Entity]:
        """Detect PII spans in `text` and return them as Entity objects."""
        if not text or not text.strip():
            return []

        try:
            payload = self.client.generate_json(PROMPT_TEMPLATE % text)
        except OllamaError as e:
            # Surface as a runtime error — caller (processor.py) wraps each
            # file in try/except and reports a per-file warning.
            raise RuntimeError(f"LLM call failed: {e}") from e

        raw_entities = payload.get("entities", []) if isinstance(payload, dict) else []
        spans = self._resolve_offsets(text, raw_entities)
        spans.extend(self._regex_fiscal_codes(text))
        spans.extend(self._regex_dates_of_birth(text))
        return self._dedupe_overlaps(spans)

    def anonymize(self, text: str, entities: Iterable[Entity] | None = None) -> str:
        """Replace detected PII with placeholders. Pass `entities` to skip NLP."""
        ents = list(entities) if entities is not None else self.analyze_and_filter(text)
        if not ents:
            return text
        # Apply right-to-left so earlier offsets stay valid as we mutate.
        result = text
        for ent in sorted(ents, key=lambda e: e.start, reverse=True):
            replacement = REPLACEMENTS.get(ent.entity_type, "[REDACTED]")
            result = result[: ent.start] + replacement + result[ent.end :]
        return result

    # ---- internals ----

    @staticmethod
    def _resolve_offsets(text: str, raw_entities: list[dict]) -> list[Entity]:
        """Map LLM-returned entity strings back to character offsets.

        The model tends to normalize whitespace when reproducing text (e.g.
        collapsing "BELFIORE   DANIELE" from a column-layout PDF extraction
        into "BELFIORE DANIELE"), so an exact `str.find` silently drops real
        matches. We match with any run of whitespace in the LLM's string
        treated as "one or more whitespace chars" against the source, which
        tolerates that normalization while still requiring exact non-space
        characters. For each detected string we find every occurrence in
        `text`, since the LLM may emit an entity once even if it appears
        multiple times.
        """
        spans: list[Entity] = []
        for raw in raw_entities:
            if not isinstance(raw, dict):
                continue
            entity_text = (raw.get("text") or "").strip()
            entity_type = (raw.get("type") or "").strip().upper()
            if not entity_text or entity_type not in VALID_TYPES:
                continue

            pattern = DocumentAnonymizer._flexible_whitespace_pattern(entity_text)
            for m in pattern.finditer(text):
                spans.append(Entity(start=m.start(), end=m.end(), entity_type=entity_type))
        return spans

    @staticmethod
    def _flexible_whitespace_pattern(entity_text: str) -> re.Pattern[str]:
        """Compile a regex matching `entity_text` with whitespace runs relaxed to `\\s+`."""
        parts = re.split(r"(\s+)", entity_text)
        pattern = "".join(r"\s+" if p.isspace() else re.escape(p) for p in parts if p)
        return re.compile(pattern)

    @staticmethod
    def _regex_fiscal_codes(text: str) -> list[Entity]:
        """Deterministic backstop for codice fiscale — see _FISCAL_CODE_RE.

        score=2.0 (LLM entities default to 1.0) so this wins position ties in
        _dedupe_overlaps — e.g. when the LLM finds the right span but the
        wrong type (mislabeling a codice fiscale as ADDRESS).
        """
        return [
            Entity(start=m.start(), end=m.end(), entity_type="FISCAL_ID", score=2.0)
            for m in _FISCAL_CODE_RE.finditer(text)
        ]

    @staticmethod
    def _regex_dates_of_birth(text: str) -> list[Entity]:
        """Label-anchored backstop for date of birth — see _DOB_LABEL_RE. score=2.0, see _regex_fiscal_codes."""
        spans: list[Entity] = []
        for label in _DOB_LABEL_RE.finditer(text):
            window_start = max(0, label.start() - _DOB_SEARCH_WINDOW)
            window_end = min(len(text), label.end() + _DOB_SEARCH_WINDOW)
            for date_m in _DATE_RE.finditer(text, window_start, window_end):
                spans.append(
                    Entity(start=date_m.start(), end=date_m.end(), entity_type="DATE_OF_BIRTH", score=2.0)
                )
        return spans

    @staticmethod
    def _dedupe_overlaps(entities: list[Entity]) -> list[Entity]:
        """Greedy overlap resolution: keep the longest span when two intersect,
        breaking ties by score (regex safety nets score 2.0 > LLM's default 1.0)."""
        if not entities:
            return []
        # Sort by start, then by length descending so longer spans win ties.
        ordered = sorted(entities, key=lambda e: (e.start, -(e.end - e.start)))
        out: list[Entity] = [ordered[0]]
        for ent in ordered[1:]:
            last = out[-1]
            if ent.start < last.end:
                # Overlap: prefer the longer span, then the higher-confidence one.
                ent_key = (ent.end - ent.start, ent.score)
                last_key = (last.end - last.start, last.score)
                if ent_key > last_key:
                    out[-1] = ent
                # else: discard `ent`
            else:
                out.append(ent)
        return out
