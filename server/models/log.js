const mongoose = require("mongoose");

const LogSchema = new mongoose.Schema({
  service: {
    type: String,
    required: true,
    trim: true,
  },
  level: {
    type: String,
    enum: ["INFO", "WARN", "ERROR", "DEBUG"],
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    expires: 604800, // 7 days TTL
  },
  meta: {
    type: Object,
    default: {},
  },
});

// Indexes (IMPORTANT for performance)
LogSchema.index({ level: 1 , service: 1});
LogSchema.index({timestamp:-1 });
LogSchema.index({ message: "text" });

module.exports = mongoose.model("Log", LogSchema);