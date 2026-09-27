"""
Unit tests for the SVG fallback sprite path: extraction from raw markup,
from the legacy JSON shape, the error case, and kind flowing into the prompt.
"""
import pytest

from app.services.asset_service import extract_svg
from app.prompts.asset_prompts import build_sprite_prompt, build_svg_sprite_prompt


def test_extract_svg_from_raw_markup():
    text = "  <svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><rect/></svg>  "
    assert extract_svg(text) == '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect/></svg>'


def test_extract_svg_from_raw_markup_with_surrounding_prose():
    text = "Here is the SVG:\n<svg viewBox=\"0 0 16 16\"><rect/></svg>\nEnjoy!"
    assert extract_svg(text) == '<svg viewBox="0 0 16 16"><rect/></svg>'


def test_extract_svg_falls_back_to_json_shape():
    # Self-closed root tag (no separate </svg>) so the raw-markup regex can't
    # match it directly — this exercises the legacy JSON-shape fallback path.
    text = '{"svg": "<svg viewBox=\\"0 0 16 16\\" />"}'
    assert extract_svg(text) == '<svg viewBox="0 0 16 16" />'


def test_extract_svg_raises_when_neither_shape_present():
    with pytest.raises(ValueError):
        extract_svg("no svg here, just prose")


def test_extract_svg_raises_on_empty_json_svg_field():
    with pytest.raises(ValueError):
        extract_svg('{"svg": ""}')


def test_sprite_prompt_includes_kind_and_guide_note():
    prompt = build_sprite_prompt("Knight", "a knight", "pixel", "", kind="background")
    assert "Asset kind: background" in prompt
    assert "BACKGROUND" in prompt


def test_svg_sprite_prompt_mentions_kind_agnostic_but_service_selects_system_prompt():
    # build_svg_sprite_prompt itself is kind-agnostic text; the per-kind rules
    # live in SVG_SPRITE_SYSTEM_PROMPTS, selected by generate_svg_sprite.
    prompt = build_svg_sprite_prompt("Forest", "a lush forest", "illustrated", kind="background")
    assert "Forest" in prompt
    assert "lush forest" in prompt


def test_extract_svg_flattens_gradients_to_first_stop():
    text = (
        '<svg viewBox="0 0 16 16"><defs>'
        '<linearGradient id="sky"><stop offset="0" stop-color="#112233"/><stop offset="1" stop-color="#fff"/></linearGradient>'
        "<radialGradient id='glow'><stop style='stop-color:#abcdef'/></radialGradient>"
        '<linearGradient id="empty"></linearGradient>'
        '<clipPath id="c"><rect/></clipPath>'
        "</defs>"
        '<rect fill="url(#sky)" stroke="url(\'#glow\')"/>'
        '<circle style="fill: url(#empty)" clip-path="url(#c)"/>'
        '<path fill="url(#missing)"/></svg>'
    )
    svg = extract_svg(text)
    assert "Gradient" not in svg and "url(#sky)" not in svg
    assert 'fill="#112233"' in svg
    assert "stroke=\"#abcdef\"" in svg
    assert "fill: #888888" in svg  # gradient with no stops
    assert 'fill="#888888"' in svg  # dangling reference
    assert 'clip-path="url(#c)"' in svg  # non-paint refs untouched
    assert "<clipPath" in svg


def test_extract_svg_drops_defs_left_empty():
    svg = extract_svg('<svg><defs><linearGradient id="a"><stop stop-color="red"/></linearGradient></defs><rect fill="url(#a)"/></svg>')
    assert svg == '<svg><rect fill="red"/></svg>'
