from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel
from typing import Optional
from datetime import datetime


class GDDSections(BaseModel):
    overview: str = ""
    mechanics: str = ""
    progression: str = ""
    levels: str = ""
    characters: str = ""
    ui: str = ""
    audio: str = ""
    visual: str = ""


class GDDCreate(BaseModel):
    sections: GDDSections


class GDDUpdate(BaseModel):
    sections: GDDSections


class GDDOut(BaseModel):
    id: str = Field(alias="_id")
    project_id: str
    sections: GDDSections
    version: int = 1
    updated_at: datetime

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class GDDInDB(BaseModel):
    project_id: str
    sections: GDDSections
    version: int = 1
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class GenerateGDDRequest(BaseModel):
    # Both optional: concept card falls back to the project's stored card, and
    # `answers` present (even {}) means "skip the sufficiency check and generate";
    # absent means "run the check first".
    concept_card: dict = Field(default_factory=dict)
    answers: Optional[dict[str, str]] = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class RefineGDDRequest(BaseModel):
    section: str
    current_content: str
    instructions: str

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class RefinedSectionOut(BaseModel):
    section: str
    content: str
