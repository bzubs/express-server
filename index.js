// server.js
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const authRoutes = require("./routes/auth");
const fastapiRoutes = require("./routes/fastapi"); // <-- import FastAPI proxy routes
const { verifyToken } = require("./middlewares/verify");

dotenv.config();
const app = express();
app.use(express.json());

// Connect MongoDB
mongoose
  .connect(
    process.env.MONGO_URI
  )
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));


const cors = require("cors");

app.use(cors({
  origin: process.env.FRONTEND_URL, 
  credentials: true,
}));


// Auth routes (register/login)
app.use("/auth", authRoutes);

// Example protected route
app.get("/profile", verifyToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

// FastAPI proxy routes (all protected except PDF verification)
app.use("/api", fastapiRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
