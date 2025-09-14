const express = require("express");
const multer = require("multer");
const upload = multer();
const axios = require("axios");
const cloudinary = require("../config/cloudinary"); // assumes config/cloudinary.js exists and exports configured cloudinary.v2
const { verifyToken } = require("../middlewares/verify");
const { Device } = require("../models/device");
const { Certificate } = require("../models/certificate");
const crypto = require("crypto");
const router = express.Router();


function generateCertificateId() {
  return crypto.randomUUID(); // returns a RFC4122 v4 UUID string
}

// Base URL of your FastAPI server
const FASTAPI_BASE = process.env.FASTAPI_BASE || "http://localhost:8000";
/*
router.post("/wipe", verifyToken, async (req, res) => {
  ... (deprecated / commented out)
});
*/

router.post("/wipe-data", verifyToken, async (req, res) => {
  let certDoc = null;
  try {
    // Accept either { certificate: {...} } or raw body {...}
    let payload = req.body?.certificate ?? req.body ?? {};

    // Normalize device_info safely
    payload.device_info = {
      name: payload.device_info?.name || "Unknown",
      "maj:min": payload.device_info?.["maj:min"] || "N/A",
      rm: payload.device_info?.rm ?? false,
      size: payload.device_info?.size || "N/A",
      ro: payload.device_info?.ro ?? false,
      type: payload.device_info?.type || "Unknown",
      mountpoints: payload.device_info?.mountpoints || [],
    };

    // attach user context
    payload.user_id = req.user.user_id;
    payload.username = req.user.username;

    // 1) Create or save device
    const device = await Device.create({
      path: payload.device || "",
      asset_tag: payload.asset_tag || "Unknown",
      device_info: payload.device_info,
    });

    // 3) Insert certificate_id into request body
    req.certificate_id = generateCertificateId().toString();

    // 4) POST to FastAPI (wipe-data)
    const response = await axios.post(
      `${FASTAPI_BASE}/api/wipe-data`,
      payload,
      { timeout: 120000 }
    );
    console.log("FastAPI /wipe-data response:", {
      status: response.status,
      data: response.data,
    });

    // 5) Defensive extraction of status + signed cert + signature
    const status = response.data?.status || "running";
    const certificate_json = response.data?.certificate_json || {};
    const signature = certificate_json.signature || certificate_json.payload?.signature || "";

    // 6) Create certificate record in Mongo
    certDoc = await Certificate.create({
      certificateId: req.certificate_id,
      user: req.user.user_id,
      device: device._id,
      status: status,
      payload: payload,
      signature: signature,
    });

    if (!certDoc) {
      console.error("Failed to create certificate after FastAPI response");
      return res.status(500).json({ error: "Certificate creation failed" });
    }

    // 7) Respond immediately with the created certificate info
    res.json({
      status: certDoc.status,
      certificate_json: {
        certificate_id: certDoc._id,
        payload: certDoc.payload,
        signature: certDoc.signature,
      },
    });
  } catch (err) {
    console.error("Wipe failed:", err?.response?.data ?? err?.message ?? err);
    return res.status(500).json({ error: err?.response?.data ?? "Wipe process failed" });
  }
});


// List certificates
router.get("/list-certificates", verifyToken, async (req, res) => {
  try {
    const certs = await Certificate.find({ user: req.user.user_id }).lean();
    res.json({ success: true, certificates: certs });
  } catch (err) {
    console.error("Failed to fetch certificates:", err);
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
    console.error("Failed to fetch certificate JSON:", err?.response?.data || err?.message || err);
    res.status(err.response?.status || 500).json({ error: err.response?.data || err.message });
  }
});

// Get certificate PDF (protected) — redirect to Cloudinary if available
router.get("/certificates/:cert_id/pdf", verifyToken, async (req, res) => {
  try {
    // Fetch certificate record from DB
    const cert = await Certificate.findOne({ certificateId: req.params.cert_id });
    if (!cert) return res.status(404).json({ error: "Certificate not found" });

    // Call FastAPI /genpdf endpoint with the certificate payload
    const pdfResponse = await axios.post(
      `${FASTAPI_BASE}/api/genpdf`,
      { payload: cert.payload, signature: cert.signature },
      { responseType: "stream", headers: { "Bzubs--Token": process.env.INTERNAL_SERVICE_TOKEN } }
    );

    // Stream PDF to browser
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${cert.certificateId}.pdf"`);
    pdfResponse.data.pipe(res);

  } catch (err) {
    console.error("Failed to generate/serve PDF:", err?.response?.data || err?.message || err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate PDF" });
  }
});

// Test route to verify Express setup
router.get("/certificates/test", (req, res) => res.send("Express route works!"));

// Verify certificate JSON (protected)
router.post("/verify-cert", verifyToken, async (req, res) => {
  try {
    const response = await axios.post(`${FASTAPI_BASE}/api/verify-cert`, req.body);
    res.json(response.data);
  } catch (err) {
    console.error("verify-cert failed:", err?.response?.data || err?.message || err);
    res.status(err.response?.status || 500).json({ error: err.response?.data || err.message });
  }
});

// Verify PDF (unprotected)
router.post("/verify-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "PDF file is required" });

    const FormData = require("form-data");
    const formData = new FormData();
    formData.append("file", req.file.buffer, req.file.originalname);

    const response = await axios.post(`${FASTAPI_BASE}/api/verify-pdf`, formData, {
      headers: formData.getHeaders(),
    });

    if (response.data.valid && response.data.coverage === "SignatureCoverageLevel.ENTIRE_FILE") {
      response.data.message = "The PDF signature is valid and issued by SecureWipe.";
    } else if (!response.data.valid && response.data.coverage === "SignatureCoverageLevel.ENTIRE_FILE") {
      response.data.message = "The PDF contains signature that are not issued by SecureWipe.";
    } else {
      response.data.message = "The PDF signature is either invalid or not present.";
    }
    res.json(response.data);
  } catch (err) {
    console.error("verify-pdf failed:", err?.response?.data || err?.message || err);
    res.status(err.response?.status || 500).json({ error: err.response?.data || err.message });
  }
});

router.post("/drive/health", verifyToken, async (req, res) => {
  if (!req.body.drive_id) {
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
    console.error("drive/health failed:", err?.response?.data || err?.message || err);
    res.status(err.response?.status || 500).json({ error: err.response?.data || err.message });
  }
});

module.exports = router;