from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import random
import asyncio

app = FastAPI()

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/classify")
async def classify_face(file: UploadFile = File(...)):
    # Simulate processing time
    await asyncio.sleep(0.5)
    
    # 70% Success Probability
    if random.random() < 0.7:
        return {
            "status": "success",
            "label": "Wajah Dikenali",
            "confidence": round(random.uniform(0.85, 0.99), 2),
            "message": "Deteksi berhasil."
        }
    else:
        # 30% Error Probability
        return {
            "status": "error",
            "label": "null",
            "confidence": 0,
            "message": "Gambar terlalu buram atau wajah tidak ditemukan."
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
