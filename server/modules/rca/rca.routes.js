const express = require("express");
const router = express.Router();
const { getGroupedIncidents ,analyzeIncident} = require("./rca.controller");

router.get("/incidents", getGroupedIncidents);
router.get("/analyze", analyzeIncident);
module.exports = router;