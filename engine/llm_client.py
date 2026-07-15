"""Thin HTTP client for Ollama's local API.

Assumes `ollama serve` is already reachable on localhost — sidecar spawning
is handled by the Electron main process (electron/ollama.js).
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass


DEFAULT_HOST = "http://127.0.0.1:11434"
DEFAULT_MODEL = "gemma4:e2b"
DEFAULT_TIMEOUT = 180  # seconds — first cold-start inference can be slow on CPU
DEFAULT_RETRIES = 2


class OllamaError(RuntimeError):
    """Raised when the Ollama server is unreachable or returns an error."""


class ModelNotFoundError(OllamaError):
    """Raised when the configured model is not present on the server."""


@dataclass(frozen=True)
class OllamaConfig:
    host: str
    model: str
    timeout: int
    retries: int

    @classmethod
    def from_env(cls) -> "OllamaConfig":
        return cls(
            host=os.environ.get("OLLAMA_HOST", DEFAULT_HOST).rstrip("/"),
            model=os.environ.get("OLLAMA_MODEL", DEFAULT_MODEL),
            timeout=int(os.environ.get("OLLAMA_TIMEOUT", DEFAULT_TIMEOUT)),
            retries=int(os.environ.get("OLLAMA_RETRIES", DEFAULT_RETRIES)),
        )


class OllamaClient:
    """Minimal Ollama HTTP client. Stdlib-only — no extra deps in the bundle."""

    def __init__(self, config: OllamaConfig | None = None):
        self.config = config or OllamaConfig.from_env()
        self._model_checked = False

    def health(self) -> bool:
        """Return True if the server responds on /api/tags."""
        try:
            self._get("/api/tags")
            return True
        except OllamaError:
            return False

    def model_available(self) -> bool:
        """Return True if the configured model is loaded on the server."""
        try:
            data = self._get("/api/tags")
        except OllamaError:
            return False
        names = {m.get("name") for m in data.get("models", [])}
        return self.config.model in names

    def generate_json(self, prompt: str) -> dict:
        """Call /api/generate with format=json and return parsed JSON.

        Raises OllamaError on transport/model errors, json.JSONDecodeError
        on malformed model output.
        """
        # Check once per client instance, not per call — a folder run makes
        # one generate_json call per file/page, and the model can't vanish
        # mid-run under normal operation.
        if not self._model_checked:
            if not self.model_available():
                raise ModelNotFoundError(
                    f"Model '{self.config.model}' not found on {self.config.host}. "
                    "Run: ollama pull " + self.config.model
                )
            self._model_checked = True

        payload = {
            "model": self.config.model,
            "prompt": prompt,
            "format": "json",
            "stream": False,
            # Keep the model loaded between calls — slow files (OCR pages)
            # can otherwise exceed Ollama's 5-minute default unload timer,
            # forcing a costly reload mid-batch.
            "keep_alive": "30m",
            "options": {
                "temperature": 0,
                "num_ctx": 8192,
            },
        }

        last_err: Exception | None = None
        for attempt in range(self.config.retries + 1):
            try:
                body = self._post("/api/generate", payload)
                response_text = body.get("response", "")
                return json.loads(response_text)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                last_err = e
                if attempt < self.config.retries:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                raise OllamaError(f"generate_json failed after {attempt + 1} attempts: {e}") from e
        # Should be unreachable, but keeps type checkers honest.
        raise OllamaError(f"generate_json failed: {last_err}")

    # ---- internals ----

    def _get(self, path: str) -> dict:
        req = urllib.request.Request(self.config.host + path, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read())
        except (urllib.error.URLError, TimeoutError) as e:
            raise OllamaError(f"GET {path} failed: {e}") from e

    def _post(self, path: str, body: dict) -> dict:
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            self.config.host + path,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.config.timeout) as resp:
            return json.loads(resp.read())
