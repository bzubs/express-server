// middlewares/authMiddleware.js
const jwt = require("jsonwebtoken");
const SECRET_KEY = process.env.JWT_SECRET;

function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Missing token" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, SECRET_KEY);
    req.user = payload; // attach decoded payload to request
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

module.exports = { verifyToken };
