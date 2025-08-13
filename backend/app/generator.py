from typing import Optional, List, Dict, Any
import json
import os
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from .types import Deck, Slide, CodeBlock, TableBlock
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
        # If value is a JSON-stringified object, try to decode and rebuild
        t = value.strip()
        if (t.startswith("{") and t.endswith("}")) or (t.startswith("[") and t.endswith("]")):
            try:
                obj = json.loads(t)
                rebuilt = _pick_diagram(obj)
                if rebuilt:
                    return rebuilt
            except Exception:
                pass
        return value
    if isinstance(value, list):
        return "\n".join(_to_str(v) for v in value)
    if isinstance(value, dict):
        # Single-key objects like {"flowchart TD": "A-->B"}
        if len(value) == 1:
            k = next(iter(value.keys()))
            v = value[k]
            if isinstance(v, (str, list, dict)):
                key_l = str(k).strip()
                prefix = key_l.split()[0].lower()
                if prefix in {
                    "flowchart", "graph", "sequencediagram", "classdiagram",
                    "statediagram", "statediagram-v2", "erdiagram", "gantt",
                    "journey", "pie", "mindmap", "timeline", "gitgraph",
                }:
                    return f"{k}\n{_to_str(v)}"
        # Prefer explicit Mermaid keys if present
        mermaid_keys = (
            "flowchart", "graph", "sequenceDiagram", "classDiagram",
            "stateDiagram", "stateDiagram-v2", "erDiagram", "gantt",
            "journey", "pie", "mindmap", "timeline", "gitGraph",
        )
        for k in mermaid_keys:
            if k in value and isinstance(value[k], (str, list, dict)):
                body = _to_str(value[k])
                return f"{k}\n{body}" if not body.strip().lower().startswith(("graph", "flowchart", "sequencediagram", "classdiagram", "statediagram")) else body
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
        if isinstance(value.get("code"), (str, list, dict)):
            return CodeBlock(language=value.get("language"), content=_to_str(value.get("code")))
        return CodeBlock(language=value.get("language"), content=_to_str(value))
    return CodeBlock(language=None, content=_to_str(value))


def _pick_table(value: Any) -> Optional[TableBlock]:
    if not value or not isinstance(value, dict):
        return None
    headers = value.get("headers")
    rows = value.get("rows")
    if isinstance(headers, list) and isinstance(rows, list):
        headers = [ _to_str(h) for h in headers ]
        rows = [ [ _to_str(c) for c in r ] for r in rows ]
        return TableBlock(headers=headers, rows=rows)
    return None


def generate_deck(topic: str, level: str = "beginner") -> Deck:
    topic = topic.strip().rstrip("?.!")
    if not settings.znapai_api_key:
        raise RuntimeError("ZnapAI_API_KEY missing")
    data = _generate_with_znapai(topic, level)
    slides: List[Slide] = []
    for raw in data:
        title = _to_str(raw.get("title", ""))
        body = _to_str(raw.get("body", ""))
        diagram = _pick_diagram(raw.get("diagram"))
        code_block = _pick_code(raw.get("code"))
        table_block = _pick_table(raw.get("table"))
        image = raw.get("image") if isinstance(raw.get("image"), str) else None
        slides.append(Slide(title=title, body=body, image=image, diagram=diagram, code=code_block, table=table_block))
    return Deck(topic=topic, level=level, slides=slides)


def append_slide(deck: Deck, question: str, slide_index: Optional[int] = None, replace: bool = False) -> Deck:
    q = question.strip().rstrip("?.!")
    ctx: Optional[Slide] = None
    if slide_index is not None:
        if replace:
            if 0 <= slide_index < len(deck.slides):
                ctx = deck.slides[slide_index]
        else:
            if 0 <= slide_index - 1 < len(deck.slides):
                ctx = deck.slides[slide_index - 1]
    else:
        if len(deck.slides) > 0:
            ctx = deck.slides[-1]

    try:
        data = _qa_with_znapai(deck.topic, q, ctx)
        title = _to_str(data.get("title", f"Q: {q}"))
        body = _to_str(data.get("body", _answer_stub(deck.topic, q)))
        diagram = _pick_diagram(data.get("diagram"))
        code_block = _pick_code(data.get("code"))
        table_block = _pick_table(data.get("table"))
        new_slide = Slide(title=title, body=body, diagram=diagram, code=code_block, table=table_block)
    except Exception:
        new_slide = Slide(title=f"Q: {q}", body=_answer_stub(deck.topic, q))

    if slide_index is None or slide_index < 0 or slide_index > len(deck.slides):
        deck.slides.append(new_slide)
    else:
        if replace and slide_index < len(deck.slides):
            deck.slides[slide_index] = new_slide
        else:
            deck.slides.insert(slide_index, new_slide)
    return deck


def _generate_with_znapai(topic: str, level: str) -> List[Dict[str, Any]]:
    prompt = (
        "You are an expert teacher. Return ONLY JSON. "
        "Create 14-15 slides that teach the topic progressively: intro, key concepts table, how-it-works flow, examples, insertion/lookup/deletion, collision strategies, complexity, pros/cons, common pitfalls, use cases, recap. "
        "Each slide object: {title, body, image|null, diagram|null, code|null, table|null}. "
        "body MUST be a plain string (no arrays). If you write bullets, join them with newlines. "
        "diagram: Prefer Mermaid diagrams on 5-7 slides. Use flowchart TD (or graph TD) with short, readable labels, arrows showing direction, and basic shapes like [Node], ((Start/End)), {Decision}. Quote labels that contain parentheses. DO NOT include any ``` fences, frontmatter, or init blocks. "
        "The 'diagram' field may be either a string or an object with a single key like flowchart/graph/sequenceDiagram/etc whose value is the Mermaid source. "
        "table: when a comparison fits, include {headers, rows}. Short cell values. "
        f"Topic: {topic}. Learner level: {level}."
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
            slides.append({"title": "Recap", "body": f"Key points about {topic}.", "image": None, "diagram": None, "code": None, "table": None})
    return slides


def _qa_with_znapai(topic: str, q: str, ctx: Optional[Slide]) -> Dict[str, Any]:
    ctx_text = ""
    if ctx is not None:
        ctx_text = (
            f"Context slide title: {ctx.title}\n"
            f"Context slide body: {ctx.body}\n"
        )
        if ctx.code and ctx.code.content:
            ctx_text += f"Context code (language={ctx.code.language or 'n/a'}):\n{ctx.code.content[:800]}\n"
        if ctx.diagram:
            ctx_text += f"Context diagram (mermaid):\n{ctx.diagram[:800]}\n"
    prompt = (
        "Answer the user's follow-up for the deck. Return ONLY JSON object: "
        "{title, body, diagram|null, code|null, table|null}. body MUST be a plain string. Include diagram/table/code only if it helps. "
        f"Deck topic: {topic}. Question: {q}. {ctx_text}"
        "Write a new slide that complements the context without repeating it. "
        "If you include a diagram, prefer Mermaid flowchart TD (or graph TD). Use short, readable labels, and quote labels that contain parentheses. Do not include code fences or init blocks. "
        "The 'diagram' field can be a string or an object with a key like flowchart/graph/sequenceDiagram/etc containing the Mermaid source."
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
    if isinstance(data, dict):
        return data
    raise ValueError("Invalid QA JSON")


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