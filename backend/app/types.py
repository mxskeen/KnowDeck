from typing import List, Optional
from pydantic import BaseModel, Field
import uuid


class CodeBlock(BaseModel):
    language: Optional[str] = None
    content: str


class Slide(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    title: str
    body: str
    image: Optional[str] = None
    diagram: Optional[str] = None
    code: Optional[CodeBlock] = None


class Deck(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    topic: str
    level: str
    slides: List[Slide] 