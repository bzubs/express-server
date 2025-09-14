const mongoose = require("mongoose");

const CertificateSchema = new mongoose.Schema({
  certificateId : { type: String, unique: true, required: true }, // Unique certificate identifier
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  device: { type: mongoose.Schema.Types.ObjectId, ref: "Device" },
  status: { type: String},
  payload: { type: mongoose.Schema.Types.Mixed },  // raw JSON from FastAPI
  signature: String,
  pdfUrl: String,
});

const Certificate = mongoose.model("Certificate", CertificateSchema);
module.exports = { Certificate };

