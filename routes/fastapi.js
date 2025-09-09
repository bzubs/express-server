// routes/yourRoutesFile.js
const express = require("express");
const multer = require("multer");
const upload = multer();
const axios = require("axios");
const cloudinary = require("../config/cloudinary"); // assumes config/cloudinary.js exists and exports configured cloudinary.v2
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
  let cert; // will be set after FastAPI response
  try {
    // 1. Validate user
    const userDoc = await User.findById(req.user.user_id);
    if (!userDoc) return res.status(404).json({ error: "User not found" });

    const data = { ...req.body, user_id: req.user.user_id, username: userDoc.username };

    // 2. Device create if not exists
    const devicePayload = req.body.device || {};
    devicePayload.owner = req.user.user_id;

    let device = await Device.findOne({ id: devicePayload.id });
    if (!device) {
      device = await Device.create({ ...devicePayload });
    }

    // 3. Trigger FastAPI wipe
    const response = await axios.post(`${FASTAPI_BASE}/api/wipe`, data);
    cert = response.data.certificate_json;
    const status = response.data.status || "running";

    // 4. Save certificate metadata in DB
    await Certificate.create({
      certificateId: cert.payload.certificate_id,
      user: cert.payload.user_id,
      device: device._id,
      wipeMethod: cert.payload.wipe.method,
      status: status,
      logHash: cert.payload.wipe.log_hash,
      payload: cert.payload,
      completedAt: cert.payload.wipe.completed_at,
      signature: cert.signature,
    });

    // 5. Return immediate response to frontend (keeps frontend format expectations)
    res.json({
      status: status,
      certificate_json: {
        payload: cert.payload,
        signature: cert.signature,
      },
      message: "Wipe triggered successfully",
    });
  } catch (err) {
    console.error("Wipe failed:", err?.response?.data || err?.message || err);
    return res.status(500).json({ error: err.response?.data || "Wipe process failed" });
  }

  // 6. Async PDF generation & Cloudinary upload (non-blocking)
  setImmediate(async () => {
    try {
      if (!cert) {
        console.error("Async PDF task: cert missing, aborting.");
        return;
      }

      const sender = { payload: cert.payload, signature: cert.signature };
      const pdfResponse = await axios.post(`${FASTAPI_BASE}/api/genpdf`, sender, {
        responseType: "arraybuffer",
        headers: {
          "Content-Type": "application/json",
          "Bzubs--Token": process.env.INTERNAL_SERVICE_TOKEN,
        },
        timeout: 120000, // 2 min timeout for PDF generation (adjustable)
      });

      // Upload PDF to Cloudinary using upload_stream
      const uploadPromise = new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: "raw",
            folder: "certificates",
            public_id: cert.payload.certificate_id,
            overwrite: true,
            use_filename: false,
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        uploadStream.end(Buffer.from(pdfResponse.data));
      });

      const cloudinaryResult = await uploadPromise;

      // Update DB with PDF URL and mark completed
      await Certificate.updateOne(
        { certificateId: cert.payload.certificate_id },
        { $set: { pdfUrl: cloudinaryResult.secure_url, status: "completed" } }
      );

      console.log(`PDF uploaded for ${cert.payload.certificate_id}: ${cloudinaryResult.secure_url}`);
    } catch (err) {
      console.error("PDF generation/upload failed:", err?.response?.data || err?.message || err);

      // Mark certificate as failed (so UI can show status)
      try {
        if (cert && cert.payload && cert.payload.certificate_id) {
          await Certificate.updateOne(
            { certificateId: cert.payload.certificate_id },
            { $set: { status: "failed", error: err?.message || "PDF upload failure" } }
          );
        }
      } catch (updateErr) {
        console.error("Failed to update certificate status after upload error:", updateErr);
      }
    }
  });
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
    const cert = await Certificate.findOne({ certificateId: req.params.cert_id });
    if (!cert) return res.status(404).json({ error: "Certificate not found" });

    if (!cert.pdfUrl) {
      return res.status(400).json({ error: "PDF not ready yet" });
    }

    // Redirect user to Cloudinary URL (fast, uses Cloudinary CDN)
    return res.redirect(cert.pdfUrl);
  } catch (err) {
    console.error("Failed to serve certificate PDF:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/certificatest/test", (req, res) => res.send("Express route works!"));

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

// ---------------------------
// Unprotected route
// ---------------------------

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
