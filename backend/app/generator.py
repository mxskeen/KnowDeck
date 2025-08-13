from typing import Optional, List, Dict, Any
import json
import os
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from .types import Deck, Slide, CodeBlock
from .config import settings


DEFAULT_TITLES = [
    "Overview",
    "Why it matters",
    "Core ideas",
    "How it works",
    "Example",
    "Pitfalls",
    "Quick recap",
]


_session = requests.Session()
_retry = Retry(
    total=2,
    backoff_factor=1.5,
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=frozenset(["POST"]),
)
_session.mount("https://", HTTPAdapter(max_retries=_retry))


def _to_str(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(_to_str(v) for v in value)
    if isinstance(value, dict):
        for k in ("content", "text", "value"):
            if isinstance(value.get(k), (str, list)):
                return _to_str(value.get(k))
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _pick_diagram(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(_to_str(v) for v in value)
    if isinstance(value, dict):
        for k in ("diagram", "mermaid", "code", "content", "graph"):
            if k in value and isinstance(value[k], (str, list, dict)):
                return _to_str(value[k])
        return _to_str(value)
    return None


def _pick_code(value: Any) -> Optional[CodeBlock]:
    if not value:
        return None
    if isinstance(value, str):
        return CodeBlock(language=None, content=value)
    if isinstance(value, list):
        return CodeBlock(language=None, content="\n".join(_to_str(v) for v in value))
    if isinstance(value, dict):
        content = value.get("content")
        if isinstance(content, (str, list, dict)):
            return CodeBlock(language=value.get("language"), content=_to_str(content))
        # if model put code under 'code'
        if isinstance(value.get("code"), (str, list, dict)):
            return CodeBlock(language=value.get("language"), content=_to_str(value.get("code")))
        return CodeBlock(language=value.get("language"), content=_to_str(value))
    return CodeBlock(language=None, content=_to_str(value))


def generate_deck(topic: str, level: str = "beginner") -> Deck:
    topic = topic.strip().rstrip("?.!")
    if not settings.znapai_api_key:
        raise RuntimeError("ZnapAI_API_KEY missing")
    data = _generate_with_znapai(topic, level)
    slides: List[Slide] = []
    for raw in data:
        # normalize unpredictable shapes
        title = _to_str(raw.get("title", ""))
        body = _to_str(raw.get("body", ""))
        diagram = _pick_diagram(raw.get("diagram"))
        code_block = _pick_code(raw.get("code"))
        image = raw.get("image") if isinstance(raw.get("image"), str) else None
        slides.append(Slide(title=title, body=body, image=image, diagram=diagram, code=code_block))
    return Deck(topic=topic, level=level, slides=slides)


def append_slide(deck: Deck, question: str, slide_index: Optional[int] = None) -> Deck:
    q = question.strip().rstrip("?.!")
    title = f"Q: {q}"
    detail = _answer_stub(deck.topic, q)
    slide = Slide(title=title, body=detail)
    deck.slides.append(slide)
    return deck


def _generate_with_znapai(topic: str, level: str) -> List[Dict[str, Any]]:
    prompt = (
        "You are an expert teacher. Return ONLY JSON. "
        "Create 14-15 slides that teach the topic progressively: intro, key concepts table, how-it-works flow, examples, insertion/lookup/deletion, collision strategies, complexity, pros/cons, common pitfalls, use cases, recap. "
        "Each slide object: {title, body, image|null, diagram|null, code|null}. "
        "body MUST be a plain string, not an array. If you write bullets, join them with newlines. "
        "diagram: if helpful, a valid Mermaid flowchart TD (3-10 nodes). If not needed, null. "
        "code: if helpful, an object {language, content} with short snippet; else null. "
        f"Topic: {topic}. Learner level: {level}. Keep body concise (2-4 bullet sentences)."
    )
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.znapai_api_key}",
    }
    body = {
        "model": settings.znapai_model,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
    }
    resp = _session.post(
        "https://api.znapai.com/v1/chat/completions",
        headers=headers,
        data=json.dumps(body),
        timeout=(10, 60),
    )
    resp.raise_for_status()
    out = resp.json()
    content = out.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    data = _parse_json_content(content)
    slides = data.get("slides") if isinstance(data, dict) else data
    if not isinstance(slides, list) or not slides or not isinstance(slides[0], dict):
        raise ValueError("ZnapAI returned invalid slide JSON")
    if len(slides) > 15:
        slides = slides[:15]
    if len(slides) < 14:
        while len(slides) < 14:
            slides.append({"title": "Recap", "body": f"Key points about {topic}.", "image": None, "diagram": None, "code": None})
    return slides


def _parse_json_content(content: str) -> Any:
    t = content.strip()
    if t.startswith("```"):
        t = t.strip('`')
        if t.startswith("json\n"):
            t = t[len("json\n"):]
        if t.endswith("```"):
            t = t[:-3]
        t = t.strip()
    try:
        return json.loads(t)
    except Exception:
        start = t.find("["); end = t.rfind("]")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(t[start:end+1])
            except Exception:
                pass
        start = t.find("{"); end = t.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(t[start:end+1])
        raise


def _body_for(title: str, topic: str, level: str) -> str:
    if title == "Overview":
        return f"{topic}: a {level} friendly intro with the big picture."
    if title == "Why it matters":
        return f"Where {topic} helps in real life and trade‑offs to know."
    if title == "Core ideas":
        return f"Key terms and concepts behind {topic}."
    if title == "How it works":
        return f"The simple flow of {topic} in steps."
    if title == "Example":
        return f"A small example to see {topic} in action."
    if title == "Pitfalls":
        return f"Common mistakes when learning or using {topic}."
    if title == "Quick recap":
        return f"What to remember about {topic}."
    return f"Notes on {topic}."


def _answer_stub(topic: str, q: str) -> str:
    return (
        f"About {topic}: {q} — here is a short clarification with a simple rule of thumb, "
        f"plus one tip to avoid a common mistake."
    ) 