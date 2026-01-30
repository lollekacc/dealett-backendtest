import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";


import chatRoutes from "./routes/chat.js";
import searchRoutes from "./routes/search.js";



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use((req, res, next) => {
  console.log("INCOMING:", req.method, req.url);
  next();
});

app.use(cors());
app.use(express.json());

// API routes
app.use("/api/chat", chatRoutes);
app.use("/api/search", searchRoutes);

// Serve frontend
app.use(express.static(path.join(__dirname, "../Adeala2-main")));

// Fallback → index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../Adeala2-main/index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});
