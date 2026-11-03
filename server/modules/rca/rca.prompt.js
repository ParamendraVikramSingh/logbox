const buildRcaPrompt = (context) => {
  return `
You are an expert Site Reliability Engineer.

Analyze the incident and return ONLY valid JSON.
DO NOT include markdown, backticks, or explanations.

JSON format:
{
  "incident_summary": "",
  "likely_root_cause": "",
  "confidence": 0,
  "severity": "low|medium|high|critical",
  "evidence": [],
  "blast_radius": "",
  "recommended_fixes": [],
  "preventive_actions": []
}
Rules:
- Use only the provided evidence
- Do not hallucinate infrastructure not mentioned
- Be concise but technical
- confidence must be 0 to 100

Incident Context:
${JSON.stringify(context, null, 2)}
`;
};

module.exports = { buildRcaPrompt };

