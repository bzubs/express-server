// routes/auth.js
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { User } = require("../models/user"); // use require for CommonJS

const router = express.Router();
const SECRET_KEY = process.env.JWT_SECRET || "supersecretkey";
const TOKEN_EXPIRY = "1h";

// Register
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, passwordHash: hash });
    res.json({ success: true, userId: user._id });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user)
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid)
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    const token = jwt.sign(
      { user_id: user._id, username: user.username },
      SECRET_KEY,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
