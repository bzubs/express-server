// models/Device.js
const mongoose = require("mongoose");

const DeviceSchema = new mongoose.Schema({
  id: { type: String, required: true },
  model: String,
  firmware: String,
  capacityGb: Number,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

const Device = mongoose.model("Device", DeviceSchema);
module.exports = { Device };
