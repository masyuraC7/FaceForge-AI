import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import cors from "cors";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Route: Classify (Mocking the FastAPI logic)
  app.post("/api/classify", upload.single("file"), (req, res) => {
    console.log(`[API] Received classification request for: ${req.file?.originalname}`);
    
    if (!req.file) {
      return res.status(400).json({
        status: "error",
        message: "No file uploaded."
      });
    }
    // Simulate processing delay
    setTimeout(() => {
      const isSuccess = Math.random() < 0.7;
      
      if (isSuccess) {
        res.json({
          status: "success",
          label: "Wajah Dikenali",
          confidence: parseFloat((Math.random() * (0.99 - 0.85) + 0.85).toFixed(2)),
          message: "Deteksi berhasil."
        });
      } else {
        res.json({
          status: "error",
          label: "null",
          confidence: 0,
          message: "Gambar terlalu buram atau wajah tidak ditemukan."
        });
      }
    }, 500);
  });

  // API 404 handler
  app.use("/api/*", (req, res) => {
    res.status(404).json({
      status: "error",
      message: `API route ${req.originalUrl} not found.`
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
