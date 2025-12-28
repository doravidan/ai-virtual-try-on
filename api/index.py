from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.responses import Response
import uvicorn
import shutil
import os
import uuid
import time

from .scraper import extract_images_from_url
from .tryon import generate_tryon_image

app = FastAPI()

# Use /tmp for uploads on Vercel, local 'uploads' otherwise
if os.environ.get("VERCEL"):
    UPLOAD_DIR = "/tmp/uploads"
else:
    UPLOAD_DIR = "uploads"

os.makedirs(UPLOAD_DIR, exist_ok=True)
# os.makedirs("static", exist_ok=True) # Unnecessary on Vercel, static is bundled

@app.post("/extract-image")
async def extract_image(url: str = Form(...)):
    try:
        images = extract_images_from_url(url)
        if not images:
            raise HTTPException(status_code=400, detail="Could not extract image from this URL")
        return {"image_url": images[0]}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})

@app.post("/generate")
async def generate(
    base_image: UploadFile = File(...),
    garment_image: UploadFile = File(None),
    garment_url: str = Form(None),
    garment_category: str = Form("tops"),
    preserve_shoes: bool = Form(False),
    add_train: bool = Form(False),
    modesty_mode: bool = Form(False),
    custom_prompt: str = Form("")
):
    request_id = str(uuid.uuid4())
    start_time = time.time()
    print(f"[{request_id}] Starting generation request...")

    try:
        # 1. Save base image
        base_path = os.path.join(UPLOAD_DIR, f"{request_id}_base_{base_image.filename}")
        with open(base_path, "wb") as buffer:
            shutil.copyfileobj(base_image.file, buffer)

        # 2. Get garment image path or URL
        garment_path_or_url = ""
        if garment_image:
            garment_path = os.path.join(UPLOAD_DIR, f"{request_id}_garment_{garment_image.filename}")
            with open(garment_path, "wb") as buffer:
                shutil.copyfileobj(garment_image.file, buffer)
            garment_path_or_url = garment_path
        elif garment_url:
            garment_path_or_url = garment_url
        else:
            raise HTTPException(status_code=400, detail="No garment image or URL provided")

        # 3. Construct advanced options string
        advanced_options = []
        if preserve_shoes: advanced_options.append("Preserve the original shoes from the base image.")
        if add_train: advanced_options.append("Add a long elegant train to the dress.")
        if modesty_mode: advanced_options.append("Apply modesty: ensure a higher neckline and longer sleeves if necessary.")
        advanced_text = " ".join(advanced_options)

        # 4. Generate
        result_url = generate_tryon_image(
            base_path, 
            garment_path_or_url, 
            garment_category=garment_category,
            custom_prompt=custom_prompt,
            advanced_instructions=advanced_text
        )

        duration = time.time() - start_time
        print(f"[{request_id}] Completed in {duration:.2f}s")

        return {"result_url": result_url}

    except HTTPException as e:
        # Preserve intended status codes (e.g. auth failures, bad input)
        print(f"[{request_id}] HTTP error {e.status_code}: {e.detail}")
        return JSONResponse(status_code=e.status_code, content={"detail": e.detail})
    except Exception as e:
        print(f"[{request_id}] Error: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"detail": str(e)})

@app.get("/favicon.ico")
async def favicon():
    # Avoid noisy 404s in the browser devtools; you can replace with a real icon later.
    return Response(status_code=204)

@app.get("/health")
async def health():
    return {"status": "ok"}

# app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

