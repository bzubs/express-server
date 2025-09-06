const express = require("express");
const multer = require("multer");
const upload = multer();
const axios = require("axios");
const { verifyToken } = require("../middlewares/verify");
const { Device } = require("../models/device");
const { Certificate } = require("../models/certificate");
const { User } = require("../models/user");
const router = express.Router();

// Base URL of your FastAPI server
const FASTAPI_BASE = process.env.FASTAPI_BASE || "http://localhost:8000";

// ---------------------------
// Protected routes
// ---------------------------

// Start wipe (protected)
router.post("/wipe", verifyToken, async (req, res) => {
  try {
    

  const userDoc = await User.findById(req.user.user_id);
  if (!userDoc) return res.status(404).json({ error: "User not found" });

  const data = { ...req.body, user_id: req.user.user_id, username: userDoc.username};


    const devicePayload = req.body.device;
    devicePayload['owner'] = req.user.user_id;

    // ---------------------------
    // Device: create if not exists
    // ---------------------------

    let device = await Device.findOne({ where: { id: devicePayload.id } });
    if (!device) {
      device = await Device.create({
        id: devicePayload.id,
        model: devicePayload.model,
        firmware: devicePayload.firmware,
        capacity_gb: devicePayload.capacity_gb,
        owner: devicePayload.owner,
      });
    }

    const response = await axios.post(`${FASTAPI_BASE}/api/wipe`, data);

    // Get the signed JSON certificate
    const cert = response.data.certificate_json;

    await Certificate.create({
      certificateId: cert.payload.certificate_id,          // schema field
      user: cert.payload.user_id,                         // ObjectId of user
      device: device._id,                                 // ObjectId of device (from DB)
      wipeMethod: cert.payload.wipe.method,               // wipe method
      status: response.data.status || "running",         // running/completed/failed
      logHash: cert.payload.wipe.log_hash,                // log hash
      payload: cert,                                      // full signed JSON
      pdfPath: response.data.certificate_pdf,             // signed PDF path
      completedAt: cert.payload.wipe.completed_at,        // when wipe ended
    });

    res.json(response.data); // still return FastAPI response
  } catch (err) {
    console.error(err);
    res
      .status(err.response?.status || 500)
      .json({ error: err.response?.data || err.message });
  }
});

router.get("/list-certificates", verifyToken, async (req, res) => {
  try {
    const certs = await Certificate.find({ user: req.user.user_id });
    res.json({ success: true, certificates: certs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch certificates" });
  }
});

// Get certificate JSON (protected)
router.get("/certificates/:cert_id", verifyToken, async (req, res) => {
  try {
    const { cert_id } = req.params;
    const response = await axios.get(`${FASTAPI_BASE}/api/certificates/${cert_id}`);
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.response?.data || err.message });
  }
});

// Get certificate PDF (protected) — **streamed**
router.get("/certificates/:cert_id/pdf", verifyToken, async (req, res) => {
  try {
    const { cert_id } = req.params;

    const response = await axios.get(
      `${FASTAPI_BASE}/api/certificates/${cert_id}/pdf`,
      { responseType: "stream" }
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${cert_id}_signed.pdf"`
    );

    response.data.pipe(res); // stream directly
  } catch (err) {
    console.error(err);
    res
      .status(err.response?.status || 500)
      .json({ error: err.response?.data || err.message });
  }
});

router.get("/certificatest/test", (req, res) => res.send("Express route works!"));

// Verify certificate JSON (protected)
router.post("/verify-cert", verifyToken, async (req, res) => {
  try {
    const response = await axios.post(`${FASTAPI_BASE}/api/verify-cert`, req.body);
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.response?.data || err.message });
  }
});

// ---------------------------
// Unprotected route
// ---------------------------

// Verify PDF (unprotected)
router.post("/verify-pdf", upload.single("file"), async (req, res) => {
  try {
    // Assuming req.file contains the PDF, e.g., using multer middleware
    if (!req.file) return res.status(400).json({ error: "PDF file is required" });

    const FormData = require("form-data");
    const formData = new FormData();
    formData.append("file", req.file.buffer, req.file.originalname);

    const response = await axios.post(`${FASTAPI_BASE}/api/verify-pdf`, formData, {
      headers: formData.getHeaders(),
    });

    if(response.data.valid && response.data.coverage === "SignatureCoverageLevel.ENTIRE_FILE"){
      response.data.message = "The PDF signature is valid and issued by SecureWipe.";

    }
    else if(!response.data.valid && response.data.coverage === "SignatureCoverageLevel.ENTIRE_FILE"){
      response.data.message = "The PDF contains signature that are not issued by SecureWipe.";
    }

    else{
      response.data.message = "The PDF signature is either invalid or not present.";
    }
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.response?.data || err.message });
  }
});


router.post("/drive/health", verifyToken, async (req, res) => {

  if(!req.body.drive_id){
    return res.status(400).json({ error: "Drive ID field is required" });
  }
  try {
    const response = await axios.post(`${FASTAPI_BASE}/api/drive/health`, req.body);

    // Health prediction and messaging based only on health_score
    const score = response.data.health_score;
    response.data.prediction = `${Math.round(score * 100)}%`;
    response.data.temperature = 34;
    response.data.smart_status = "OK";
    if (score >= 0 && score < 0.3) {
      response.data.message = "The drive is robust. No failure predicted.";
    } else if (score >= 0.3 && score < 0.5) {
      response.data.message = "The drive is healthy. Minimal risk detected.";
    } else if (score >= 0.5 && score < 0.8) {
      response.data.message = "The drive shows moderate risk. Consider monitoring and backing up important data.";
    } else if (score >= 0.8 && score <= 1) {
      response.data.message = "The drive is predicted to fail. Please avoid using it for critical data.";
    } else {
      response.data.message = "Unable to determine drive health. Please check input or try again.";
    }
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.response?.data || err.message });
  }
});

module.exports = router;
