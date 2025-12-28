from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.responses import Response
import uvicorn
import shutil
import os
import uuid
import time
from jose import jwt
from supabase import create_client, Client

from .scraper import extract_images_from_url
from .tryon import generate_tryon_image

app = FastAPI()

# Supabase Config
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET") # Found in Supabase Settings > API

# Initialize Supabase Admin Client
supabase: Client = None
if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Use /tmp for uploads on Vercel, local 'uploads' otherwise
if os.environ.get("VERCEL"):
    UPLOAD_DIR = "/tmp/uploads"
else:
    UPLOAD_DIR = "uploads"

os.makedirs(UPLOAD_DIR, exist_ok=True)

async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    
    token = authorization.split(" ")[1]
    try:
        # Verify the Supabase JWT
        payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
        return payload
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

@app.post("/generate")
async def generate(
    base_image: UploadFile = File(...),
    garment_image: UploadFile = File(None),
    garment_url: str = Form(None),
    garment_category: str = Form("tops"),
    preserve_shoes: bool = Form(False),
    add_train: bool = Form(False),
    modesty_mode: bool = Form(False),
    custom_prompt: str = Form(""),
    authorization: str = Header(None)
):
    # 1. Auth & Credit Check
    user = await get_current_user(authorization)
    user_id = user["sub"]
    
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    # Fetch user profile
    profile = supabase.table("profiles").select("credits").eq("id", user_id).single().execute()
    if not profile.data or profile.data["credits"] < 1:
        raise HTTPException(status_code=402, detail="Insufficient credits. Please top up.")

    request_id = str(uuid.uuid4())
    # ... (rest of the logic remains similar but with credit deduction)
    
    try:
        # 2. Save base image
        base_path = os.path.join(UPLOAD_DIR, f"{request_id}_base_{base_image.filename}")
        with open(base_path, "wb") as buffer:
            shutil.copyfileobj(base_image.file, buffer)

        # 3. Get garment image
        garment_path_or_url = ""
        if garment_image:
            garment_path = os.path.join(UPLOAD_DIR, f"{request_id}_garment_{garment_image.filename}")
            with open(garment_path, "wb") as buffer:
                shutil.copyfileobj(garment_image.file, buffer)
            garment_path_or_url = garment_path
        elif garment_url:
            garment_path_or_url = garment_url
        else:
            raise HTTPException(status_code=400, detail="No garment image provided")

        # 4. Generate
        result_url = generate_tryon_image(
            base_path, 
            garment_path_or_url, 
            garment_category=garment_category
        )

        # 5. Deduct Credit
        supabase.table("profiles").update({"credits": profile.data["credits"] - 1}).eq("id", user_id).execute()

        return {"result_url": result_url, "remaining_credits": profile.data["credits"] - 1}

    except HTTPException as e:
        return JSONResponse(status_code=e.status_code, content={"detail": e.detail})
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})

@app.get("/user/profile")
async def get_profile(authorization: str = Header(None)):
    user = await get_current_user(authorization)
    profile = supabase.table("profiles").select("*").eq("id", user["sub"]).single().execute()
    return profile.data

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

