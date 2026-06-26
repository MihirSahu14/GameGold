"""
Sprite image generation via the Replicate HTTP API (no SDK needed).
Uses Flux Schnell — fast (~2 s) and cheap; the art style is steered through
the prompt built by the LLM. Replicate output URLs expire after ~1 hour, so
the image is downloaded immediately and stored as a base64 data URI in MongoDB
(Cloudflare R2 takes over in prod / Phase 5).
"""
import base64

import httpx

from app.config import settings

REPLICATE_API = "https://api.replicate.com/v1"
IMAGE_MODEL = "black-forest-labs/flux-schnell"


class SpriteGenerationError(Exception):
    pass


async def generate_sprite_image(image_prompt: str, style: str) -> str:
    """Generate an image and return it as a data URI. Raises SpriteGenerationError."""
    if not settings.replicate_api_token:
        raise SpriteGenerationError(
            "Sprite generation needs a Replicate key — add REPLICATE_API_TOKEN to backend/.env "
            "(get one at replicate.com)."
        )

    style_prefix = (
        "pixel art game sprite, crisp pixels, no anti-aliasing, "
        if style == "pixel"
        else "2D illustrated game sprite, clean shapes, "
    )

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{REPLICATE_API}/models/{IMAGE_MODEL}/predictions",
            headers={
                "Authorization": f"Bearer {settings.replicate_api_token}",
                "Prefer": "wait",  # block until the prediction finishes (max 60 s)
            },
            json={
                "input": {
                    "prompt": style_prefix + image_prompt,
                    "aspect_ratio": "1:1",
                    "output_format": "png",
                    "megapixels": "0.25",
                }
            },
        )
        if resp.status_code not in (200, 201):
            raise SpriteGenerationError(f"Replicate error {resp.status_code}: {resp.text[:300]}")

        prediction = resp.json()
        if prediction.get("status") == "failed":
            raise SpriteGenerationError(f"Image generation failed: {prediction.get('error')}")

        output = prediction.get("output")
        image_url = output[0] if isinstance(output, list) else output
        if not image_url:
            raise SpriteGenerationError("Replicate returned no image output")

        image_resp = await client.get(image_url)
        image_resp.raise_for_status()

    encoded = base64.b64encode(image_resp.content).decode()
    return f"data:image/png;base64,{encoded}"
