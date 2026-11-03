const client = require("../../config/elasticsearch");

const READ_LOGS_INDICES = Array.from(
  new Set([
    process.env.ELASTICSEARCH_INDEX,
    process.env.ELASTICSEARCH_WRITE_INDEX,
    "logs",
  ].filter(Boolean))
).join(",");

const buildExactFilter = (field, value) => ({
  bool: {
    should: [
      { term: { [`${field}.keyword`]: value } },
      { term: { [field]: value } },
    ],
    minimum_should_match: 1,
  },
});

const buildSyntheticFilter = (value) => ({
  bool: {
    should: [
      { match_phrase: { message: value } },
      { match_phrase: { error: value } },
      { match_phrase: { event: value } },
      { match_phrase: { route: value } },
      { match_phrase: { module: value } },
      { match_phrase: { service: value } },
    ],
    minimum_should_match: 1,
  },
});

const buildIncidentContext = async ({ fingerprint, syntheticFilter, from, to }) => {
  const filters = [];

  if (syntheticFilter) {
    filters.push(buildSyntheticFilter(syntheticFilter));
  } else {
    filters.push({
      bool: {
        should: [
          { term: { service: fingerprint } },
          { term: { fingerprint: fingerprint } },
          { term: { errorFingerprint: fingerprint } },
        ],
        minimum_should_match: 1,
      },
    });
  }

  filters.push({
    range: {
      timestamp: {
        gte: from,
        lte: to,
      },
    },
  });

  const result = await client.search({
    index: READ_LOGS_INDICES,
    size: 200,
    sort: [{ timestamp: "asc" }],
    query: {
      bool: {
        filter: filters,
      },
    },
    _source: [
      "timestamp",
      "message",
      "route",
      "method",
      "statusCode",
      "service",
      "level",
      "errorFingerprint",
      "responseTime",
      "error",
      "stack",
      "requestId",
      "traceId",
    ],
    aggs: {
      routes: {
        terms: {
          field: "route",
          size: 10,
        },
      },
      services: {
        terms: {
          field: "service",
          size: 10,
        },
      },
      levels: {
        terms: {
          field: "level",
          size: 10,
        },
      },
      status_codes: {
        terms: {
          field: "statusCode",
          size: 10,
        },
      },
    },
  });

  const hits = result.hits.hits.map((hit) => hit._source);

  if (!hits.length) {
    throw new Error(
      syntheticFilter
        ? `No logs found for this grouped incident filter: ${syntheticFilter}`
        : "No logs found for this fingerprint"
    );
  }

  const firstLog = hits[0];
  const lastLog = hits[hits.length - 1];

  const sampleLogs = hits.slice(0, 15).map((log) => ({
    timestamp: log.timestamp,
    level: log.level,
    message: log.message,
    route: log.route || null,
    service: log.service || null,
    statusCode: log.statusCode || null,
    method: log.method || null,
  }));

  const timeline = hits.slice(0, 20).map((log) => {
    return `${log.timestamp} - ${log.level?.toUpperCase() || "LOG"} - ${log.message}`;
  });

  const affectedRoutes =
    result.aggregations.routes?.buckets?.map((b) => ({
      route: b.key,
      count: b.doc_count,
    })) || [];

  const affectedModules =
    result.aggregations.services?.buckets?.map((b) => ({
      module: b.key,
      count: b.doc_count,
    })) || [];

  const statusCodes =
    result.aggregations.status_codes?.buckets?.reduce((acc, item) => {
      acc[item.key] = item.doc_count;
      return acc;
    }, {}) || {};

  const levels =
    result.aggregations.levels?.buckets?.reduce((acc, item) => {
      acc[item.key] = item.doc_count;
      return acc;
    }, {}) || {};

  return {
    fingerprint,
    syntheticFilter: syntheticFilter || null,
    totalOccurrences: hits.length,
    firstSeen: firstLog.timestamp,
    lastSeen: lastLog.timestamp,
    primaryMessage: firstLog.message,
    suspectedService: firstLog.service || null,
    affectedRoutes,
    affectedModules,
    statusCodes,
    levels,
    sampleLogs,
    timeline,
  };
};

module.exports = { buildIncidentContext };
