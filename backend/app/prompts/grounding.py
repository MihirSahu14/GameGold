"""
Shared grounding contract appended to every generation system prompt.
Keeps the LLM anchored to the developer's actual game instead of inventing
characters, mechanics, or numbers when the input is thin.
"""

GROUNDING_RULES = """
Grounding rules (non-negotiable):
- Use ONLY the game details provided in the input. Never invent character names,
  mechanics, settings, locations, or numbers that are not present in or directly
  implied by the provided game details.
- When a needed detail is unspecified, write it generically and mark it inline as
  [TBD: what's missing] instead of inventing specifics.
"""
