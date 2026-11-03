const client = require("../../config/elasticsearch");
const { generateRCA } = require("./rca.ai.service");
const { buildIncidentContext } = require("./rca.service");

const READ_LOGS_INDICES = Array.from(
  new Set([
    process.env.ELASTICSEARCH_INDEX,
    process.env.ELASTICSEARCH_WRITE_INDEX,
    "logs",
  ].filter(Boolean))
).join(",");

const shouldRetryWithPlainFingerprint = (error) => {
  const message = [
    error?.message,
    error?.meta?.body?.error?.reason,
    ...(error?.meta?.body?.error?.root_cause || []).map((item) => item?.reason),
    JSON.stringify(error?.meta?.body?.error || {}),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    message.includes("fingerprint.keyword") ||
    message.includes("Fielddata is disabled on text fields") ||
    message.includes("Text fields are not optimised") ||
    message.includes("No mapping found for [fingerprint.keyword]")
  );
};

const buildExactFilter = (field, value) => ({
  bool: {
    should: [
      { term: { [`${field}.keyword`]: value } },
      { term: { [field]: value } },
    ],
    minimum_should_match: 1,
  },
});

const searchGroupedIncidents = async ({ filters, fingerprintField }) =>
  client.search({
    index: READ_LOGS_INDICES,
    size: 0,
    query: {
      bool: {
        filter: filters,
      },
    },
    aggs: {
      grouped_errors: {
        terms: {
          field: fingerprintField,
          size: 50,
          order: { _count: "desc" },
        },
        aggs: {
          latest_log: {
            top_hits: {
              size: 1,
              sort: [{ timestamp: { order: "desc" } }],
              _source: {
                includes: [
                  "message",
                  "route",
                  "method",
                  "statusCode",
                  "service",
                  "level",
                  "errorFingerprint",
                  "timestamp",
                ],
              },
            },
          },
          first_seen: {
            min: { field: "timestamp" },
          },
          last_seen: {
            max: { field: "timestamp" },
          },
        },
      },
    },
  });

const getGroupedIncidents = async (req, res) => {
  try {
    const { level, route, module, from, to } = req.query;

const filters = [];

if (level) {
  const t = String(level).trim();
  filters.push({ terms: { level: [t.toUpperCase(), t.toLowerCase(), t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()] } });
}

    if (route) filters.push(buildExactFilter("route", route));
    if (module) filters.push(buildExactFilter("module", module));

    if (from || to) {
      filters.push({
        range: {
          timestamp: {
            gte: from || "now-24h",
            lte: to || "now",
          },
        },
      });
    }

    let result;

    try {
      result = await searchGroupedIncidents({
        filters,
        fingerprintField: "service",
      });
    } catch (error) {
      if (!shouldRetryWithPlainFingerprint(error)) {
        throw error;
      }

      result = await searchGroupedIncidents({
        filters,
        fingerprintField: "service",
      });
    }

    let parsedIncidents = result.aggregations.grouped_errors.buckets.map((bucket) => {
      const log = bucket.latest_log.hits.hits[0]?._source || {};
      const levelValue = String(log.level || level || "error").toUpperCase();
      const severity =
        ["FATAL", "CRITICAL"].includes(levelValue) ? "critical" :
        ["ERROR", "EXCEPTION"].includes(levelValue) ? "high" :
        ["WARN", "WARNING"].includes(levelValue) ? "medium" :
        "low";

      let title = log.message || "Unknown error";
      let fingerprint = bucket.key;
      let syntheticFilter = null;

      if (/login/i.test(title) || /credential/i.test(title)) {
        fingerprint = "auth_login_group";
        title = "Authentication & Login Events";
        syntheticFilter = "login";
      } else if (/http request/i.test(title)) {
        fingerprint = "http_request_group";
        title = "HTTP Request";
        syntheticFilter = "HTTP Request";
      } else if (/health check/i.test(title)) {
        fingerprint = "health_check_group";
        title = "Health Check Events";
        syntheticFilter = "health check";
      } else if (/json|syntax|expected/i.test(title)) {
        fingerprint = "json_parse_group";
        title = "JSON Parsing Errors";
        syntheticFilter = "JSON";
      } else if (/required|allowed|validation/i.test(title)) {
        fingerprint = "validation_error_group";
        title = "Validation Errors";
        syntheticFilter = "required";
      } else if (/redis/i.test(title)) {
        fingerprint = "redis_error_group";
        title = "Redis & DB Events";
        syntheticFilter = "redis";
      }

      return {
        fingerprint,
        title,
        count: bucket.doc_count,
        route: log.route || null,
        method: log.method || null,
        module: log.module || null,
        statusCode: log.statusCode || null,
        severity,
        firstSeen: new Date(bucket.first_seen.value_as_string),
        lastSeen: new Date(bucket.last_seen.value_as_string),
        syntheticFilter,
      };
    });

    const mergedIncidentsMap = new Map();
    for (const inc of parsedIncidents) {
      if (mergedIncidentsMap.has(inc.fingerprint)) {
        const existing = mergedIncidentsMap.get(inc.fingerprint);
        existing.count += inc.count;
        if (inc.firstSeen < existing.firstSeen) existing.firstSeen = inc.firstSeen;
        if (inc.lastSeen > existing.lastSeen) existing.lastSeen = inc.lastSeen;
        if (existing.route !== inc.route) existing.route = "mixed";
        if (existing.method !== inc.method) existing.method = "mixed";
        const sevOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        if (sevOrder[inc.severity] > sevOrder[existing.severity]) {
          existing.severity = inc.severity;
        }
      } else {
        mergedIncidentsMap.set(inc.fingerprint, { ...inc });
      }
    }

    const incidents = Array.from(mergedIncidentsMap.values()).map(inc => ({
      ...inc,
      firstSeen: inc.firstSeen.toISOString(),
      lastSeen: inc.lastSeen.toISOString(),
    }));
    incidents.sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      total: incidents.length,
      incidents,
    });
  } catch (error) {
    console.error("Error fetching grouped incidents:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch grouped incidents",
    });
  }
};

const analyzeIncident = async (req, res) => {
  try {
    const { fingerprint, syntheticFilter, from, to } = req.query;

    if (!fingerprint) {
      return res.status(400).json({
        success: false,
        message: "fingerprint is required",
      });
    }

    const context = await buildIncidentContext({
      fingerprint,
      syntheticFilter,
      from: from || "now-24h",
      to: to || "now",
    });

    const aiRca = await generateRCA(context);

    return res.json({
      success: true,
      context,
      aiRca,
    });
  } catch (error) {
    console.error("Error analyzing incident:", error);
    const statusCode = error.message?.includes("No logs found") ? 404 : 500;

    return res.status(statusCode).json({
      success: false,
      message: "Failed to analyze incident",
      error: error.message,
    });
  }
};

module.exports = {
  getGroupedIncidents,
  analyzeIncident,
};
