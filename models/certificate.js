// models/Certificate.js
const mongoose = require("mongoose");

const CertificateSchema = new mongoose.Schema({
  certificateId: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  device: { type: mongoose.Schema.Types.ObjectId, ref: "Device", required: true },
  wipeMethod: { type: String, default: "zero-fill-1pass" },
  status: { type: String, default: "running" }, // running / completed / failed
  createdAt: { type: Date, default: Date.now },
  completedAt: Date,
  logHash: String,
  payload: { type: mongoose.Schema.Types.Mixed },  // full signed JSON from FastAPI
  signature : String,
  pdfUrl: String, // URL to the PDF stored in Cloudinary
});

const Certificate = mongoose.model("Certificate", CertificateSchema);
module.exports = { Certificate };
