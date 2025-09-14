const mongoose = require("mongoose");

const DeviceSchema = new mongoose.Schema({
  path: { type: String, required: true },
  asset_tag: { type: String },  // fixed typo
  device_info: { type: mongoose.Schema.Types.Mixed },
});

const Device = mongoose.model("Device", DeviceSchema);
module.exports = { Device };
