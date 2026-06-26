"""Tests for the shared LLM output parsing helpers."""
import pytest

from app.services.llm_utils import extract_json, strip_html


def test_extract_json_plain():
    assert extract_json('{"a": 1}') == {"a": 1}


def test_extract_json_with_fences():
    text = '```json\n{"exploits": ["x"]}\n```'
    assert extract_json(text) == {"exploits": ["x"]}


def test_extract_json_with_bare_fences():
    text = '```\n{"a": [1, 2]}\n```'
    assert extract_json(text) == {"a": [1, 2]}


def test_extract_json_with_surrounding_prose():
    text = 'Here is your result:\n{"code": "class X {}"}\nHope that helps!'
    assert extract_json(text) == {"code": "class X {}"}


def test_extract_json_raises_on_garbage():
    with pytest.raises(ValueError):
        extract_json("This is not JSON at all")


def test_strip_html_removes_tags():
    assert strip_html("<h2>Title</h2><p>Body <b>bold</b></p>") == "Title Body bold"


def test_strip_html_plain_text_unchanged():
    assert strip_html("just plain text") == "just plain text"
