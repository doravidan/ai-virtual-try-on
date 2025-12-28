import os
import base64
import tempfile
import uuid
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv
from fastapi import HTTPException
from PIL import Image, ImageOps

load_dotenv()

_FAL_KEY = os.getenv("FAL_KEY") or os.getenv("FAL_API_KEY")
_FAL_BASE_URL = os.getenv("FAL_BASE_URL", "https://fal.run")

def _is_probably_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


def _download_image(url: str, out_path: str) -> str:
    # Keep it simple but safe: require an image-ish content-type, stream to disk.
    headers = {"User-Agent": "Mozilla/5.0"}
    with requests.get(url, headers=headers, stream=True, timeout=30) as r:
        r.raise_for_status()
        content_type = (r.headers.get("content-type") or "").lower()
        if "image" not in content_type and not any(url.lower().endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".webp")):
            raise ValueError(f"URL did not look like an image (content-type={content_type!r})")

        with open(out_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 256):
                if chunk:
                    f.write(chunk)
    return out_path


def _normalize_for_edit_api(input_path: str, out_path: str) -> str:
    """
    Normalize EXIF orientation and ensure a supported format for image editing.
    We write PNG to preserve detail (and transparency if present).
    """
    with Image.open(input_path) as im:
        im = ImageOps.exif_transpose(im)
        # Ensure it's saveable consistently
        if im.mode not in ("RGB", "RGBA"):
            # Keep alpha if present-ish, otherwise RGB.
            im = im.convert("RGBA" if "A" in im.mode else "RGB")
        im.save(out_path, format="PNG")
    return out_path


def _to_data_url_png(path: str) -> str:
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def _fal_run(model_path: str, model_input: dict) -> dict:
    """
    Minimal Fal REST call. Uses FAL_KEY (format typically like: '<id>:<secret>').
    """
    if not _FAL_KEY:
        raise RuntimeError("FAL_KEY is not set. Export FAL_KEY='<id>:<secret>' before running the server.")

    url = f"{_FAL_BASE_URL.rstrip('/')}/{model_path.lstrip('/')}"
    headers = {
        # Fal docs commonly use "Key <FAL_KEY>"
        "Authorization": f"Key {_FAL_KEY}",
        "Content-Type": "application/json",
    }
    resp = requests.post(url, headers=headers, json=model_input, timeout=180)
    if resp.status_code >= 400:
        # Include response text for debugging (but never include secrets).
        if resp.status_code == 401:
            raise HTTPException(
                status_code=401,
                detail=(
                    "Fal authentication failed (401). Your `FAL_KEY` is missing, revoked, or incorrect. "
                    "Create a new key in the Fal dashboard, set it as `FAL_KEY`, restart the server, and retry."
                ),
            )
        raise RuntimeError(f"Fal request failed ({resp.status_code}): {resp.text}")
    return resp.json()


def _extract_first_image_url(result: dict) -> str:
    """
    Fal responses vary a bit by model; try common shapes.
    """
    # Common: {"images":[{"url":...}, ...]}
    images = result.get("images")
    if isinstance(images, list) and images:
        first = images[0]
        if isinstance(first, dict) and first.get("url"):
            return first["url"]

    # Sometimes nested: {"data":{"images":[{"url":...}]}}
    data = result.get("data")
    if isinstance(data, dict):
        images = data.get("images")
        if isinstance(images, list) and images and isinstance(images[0], dict) and images[0].get("url"):
            return images[0]["url"]

        image = data.get("image")
        if isinstance(image, dict) and image.get("url"):
            return image["url"]

    # Sometimes: {"image":{"url":...}}
    image = result.get("image")
    if isinstance(image, dict) and image.get("url"):
        return image["url"]

    raise RuntimeError(f"Could not find an image url in Fal response: keys={list(result.keys())}")


def generate_tryon_image(base_path, garment_path_or_url, garment_category="tops", custom_prompt="", advanced_instructions=""):
    """
    Identity-preserving virtual try-on:
    - Use Fal Nano Banana Pro Edit (Imagen 3 Pro).
    - Provide both base + garment images to the edit model (as image_urls list).
    """
    
    if not os.path.exists(base_path):
        raise FileNotFoundError(f"Base image not found: {base_path}")

    # Resolve garment to a local file path (download if URL).
    garment_local_path = garment_path_or_url
    temp_paths: list[str] = []
    try:
        if not os.path.exists(garment_local_path):
            if not _is_probably_url(garment_path_or_url):
                raise FileNotFoundError(f"Garment image not found and not a URL: {garment_path_or_url}")
            tmp_download = os.path.join(tempfile.gettempdir(), f"tryon_{uuid.uuid4()}_garment")
            garment_local_path = _download_image(garment_path_or_url, tmp_download)
            temp_paths.append(garment_local_path)

        # Normalize both images (EXIF orientation, supported format).
        base_png = os.path.join(tempfile.gettempdir(), f"tryon_{uuid.uuid4()}_base.png")
        garment_png = os.path.join(tempfile.gettempdir(), f"tryon_{uuid.uuid4()}_garment.png")
        temp_paths.extend([base_png, garment_png])

        _normalize_for_edit_api(base_path, base_png)
        _normalize_for_edit_api(garment_local_path, garment_png)

        # Construct the description for Nano Banana Pro Edit
        cat_map = {
            "tops": "upper body garment (top/shirt)",
            "bottoms": "lower body garment (pants/skirt)",
            "one-piece": "full body garment (dress/jumpsuit)"
        }
        category_text = cat_map.get(garment_category, "garment")
        
        prompt_parts = [
            "You are given 2 images.",
            "Image 1 is the BASE photo of a person.",
            "Image 2 is the GARMENT reference photo.",
            "",
            f"TASK: Edit Image 1 by replacing ONLY the person's {category_text} with the exact same clothing shown in Image 2.",
            "PRESERVE EXACTLY: the same person identity (face), hair/head covering, skin tone, pose, body shape, hands, background, camera angle, and lighting.",
            "MATCH FROM Image 2: fabric texture, color, pattern, and silhouette.",
            "Make the result photorealistic with natural folds and seams. Keep consistent shadows and perspective.",
            "Do NOT change the face. Do NOT add text or watermarks.",
        ]

        if custom_prompt:
            prompt_parts.append(f"ADDITIONAL REQUIREMENTS: {custom_prompt}")
        if advanced_instructions:
            prompt_parts.append(f"STYLE INSTRUCTIONS: {advanced_instructions}")

        edit_prompt = "\n".join(prompt_parts)

        print(f"Editing base image with Fal nano-banana-pro/edit (category: {garment_category})...")

        base_data_url = _to_data_url_png(base_png)
        garment_data_url = _to_data_url_png(garment_png)

        fal_result = _fal_run(
            "fal-ai/nano-banana-pro/edit",
            {
                "prompt": edit_prompt,
                "image_urls": [base_data_url, garment_data_url],
            },
        )

        return _extract_first_image_url(fal_result)
    finally:
        # Best-effort cleanup of temp files.
        for p in temp_paths:
            try:
                if p and os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass

