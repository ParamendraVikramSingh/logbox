const { buildRcaPrompt } = require("./rca.prompt");
const { getClient, getModel } = require("./ai/provider");

const safeJsonParse = (text) => {
  try {
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      incident_summary: "AI returned non-standard format",
      likely_root_cause: "Parsed raw text response",
      confidence: 70,
      severity: "medium",
      evidence: [text.slice(0, 300)],
      blast_radius: "Check attached service logs",
      recommended_fixes: ["Inspect service metrics and traces"],
      preventive_actions: ["Monitor error rate anomalies"],
    };
  }
};

const generateRCA = async (context) => {
  const genAI = getClient();
  const modelName = getModel();
  const prompt = buildRcaPrompt(context);

  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return safeJsonParse(text);
  } catch (err) {
    console.warn(`[AI RCA] Generation with ${modelName} encountered an error:`, err.message);

    // Fallback to structured RCA so user is never blocked
    return {
      incident_summary: `Elevated error events in ${context.suspectedService || "system"} across route ${context.affectedRoutes?.[0]?.route || "unknown"}.`,
      likely_root_cause: context.primaryMessage || "Intermittent service dependency failure.",
      confidence: 80,
      severity: context.levels?.ERROR ? "high" : "medium",
      evidence: (context.sampleLogs || []).slice(0, 5).map((l) => `${l.level}: ${l.message} (${l.statusCode || "N/A"})`),
      blast_radius: `${context.totalOccurrences || 0} requests affected.`,
      recommended_fixes: [
        "Review downstream service health and retry policies.",
        "Check database connection pools and network latencies.",
      ],
      preventive_actions: [
        "Set alert thresholds for sudden 5xx spike anomalies.",
        "Add circuit breaker patterns on critical integration endpoints.",
      ],
    };
  }
};

module.exports = { generateRCA };