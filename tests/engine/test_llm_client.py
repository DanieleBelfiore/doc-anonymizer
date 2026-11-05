import io
import json
import urllib.error

import pytest

from engine import llm_client
from engine.llm_client import ModelNotFoundError, OllamaClient, OllamaConfig, OllamaError

CONFIG = OllamaConfig(host="http://ollama.test", model="gemma4:e2b", timeout=5, retries=1)
TAGS = {"models": [{"name": "gemma4:e2b"}]}


class Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def fake_urlopen(monkeypatch, routes):
    """routes: path -> list of results (dict payload or exception), consumed in order."""
    calls = []

    def urlopen(req, timeout):
        path = req.full_url.removeprefix(CONFIG.host)
        calls.append((req.get_method(), path, req.data))
        result = routes[path].pop(0)
        if isinstance(result, Exception):
            raise result
        return Response(json.dumps(result).encode())

    monkeypatch.setattr(llm_client.urllib.request, "urlopen", urlopen)
    monkeypatch.setattr(llm_client.time, "sleep", lambda s: None)
    return calls


def test_config_from_env(monkeypatch):
    monkeypatch.setenv("OLLAMA_HOST", "http://box:1/")
    monkeypatch.setenv("OLLAMA_MODEL", "m")
    monkeypatch.setenv("OLLAMA_TIMEOUT", "7")
    monkeypatch.setenv("OLLAMA_RETRIES", "0")
    assert OllamaConfig.from_env() == OllamaConfig(host="http://box:1", model="m", timeout=7, retries=0)


def test_default_client_reads_env(monkeypatch):
    monkeypatch.delenv("OLLAMA_HOST", raising=False)
    assert OllamaClient().config.host == llm_client.DEFAULT_HOST


def test_health_and_model_checks(monkeypatch):
    down = urllib.error.URLError("refused")
    fake_urlopen(monkeypatch, {"/api/tags": [TAGS, down, {"models": [{"name": "other"}]}, down]})
    client = OllamaClient(CONFIG)
    assert client.health() is True
    assert client.health() is False
    assert client.model_available() is False
    assert client.model_available() is False


def test_generate_json_posts_the_prompt_and_checks_the_model_once(monkeypatch):
    answer = {"response": json.dumps({"entities": []})}
    calls = fake_urlopen(monkeypatch, {"/api/tags": [TAGS], "/api/generate": [answer, answer]})
    client = OllamaClient(CONFIG)
    assert client.generate_json("ciao") == {"entities": []}
    assert client.generate_json("ancora") == {"entities": []}
    assert [c[1] for c in calls] == ["/api/tags", "/api/generate", "/api/generate"]
    body = json.loads(calls[1][2])
    assert body["prompt"] == "ciao" and body["format"] == "json" and body["options"]["temperature"] == 0


def test_generate_json_retries_then_succeeds(monkeypatch):
    fake_urlopen(monkeypatch, {"/api/tags": [TAGS], "/api/generate": [{"response": "not json"}, {"response": "{}"}]})
    assert OllamaClient(CONFIG).generate_json("x") == {}


def test_generate_json_gives_up_after_the_retries(monkeypatch):
    fake_urlopen(monkeypatch, {"/api/tags": [TAGS], "/api/generate": [TimeoutError(), TimeoutError()]})
    with pytest.raises(OllamaError, match="after 2 attempts"):
        OllamaClient(CONFIG).generate_json("x")


def test_generate_json_reports_a_missing_model(monkeypatch):
    fake_urlopen(monkeypatch, {"/api/tags": [{"models": []}]})
    with pytest.raises(ModelNotFoundError, match="ollama pull gemma4:e2b"):
        OllamaClient(CONFIG).generate_json("x")
