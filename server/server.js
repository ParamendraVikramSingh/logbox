require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { addLog } = require("./services/logBuffer");
const createLogsIndex = require("./utils/createIndex");
const rcaRoutes = require("./modules/rca/rca.routes");
const client = require("./config/elasticsearch");

const app = express();
const server = http.createServer(app);
const WRITE_LOGS_INDEX = process.env.ELASTICSEARCH_WRITE_INDEX || "logs";
const READ_LOGS_INDICES = Array.from(
  new Set([
    process.env.ELASTICSEARCH_INDEX,
    process.env.ELASTICSEARCH_WRITE_INDEX,
    "logs",
  ].filter(Boolean))
).join(",");

const io = new Server(server, {
  cors: { origin: "*" },
});

app.set("io", io);
app.use(cors());
app.use(express.json());
app.use("/rca", rcaRoutes);

(async () => {
  try {
    const response = await client.info();
    console.log("Connected to Elasticsearch");
    console.log(response);
  } catch (err) {
    console.error("Elasticsearch connection failed:", err.message);
  }
})();

createLogsIndex();

const MONGO_URI = "mongodb://localhost:27017/logs";

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

function parsePositiveInt(value, fallback, max = 10000) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function buildTimeRange(start, end) {
  const range = {};
  if (start) {
    range.gte = start;
  }
  if (end) {
    range.lte = end;
  }
  return Object.keys(range).length ? range : null;
}

function roundBucket(timestampMs, bucketMs) {
  return Math.floor(timestampMs / bucketMs) * bucketMs;
}

function chooseBucketMs(start, end) {
  const from = start ? new Date(start).getTime() : Date.now() - 30 * 60 * 1000;
  const to = end ? new Date(end).getTime() : Date.now();
  const duration = Math.max(to - from, 60 * 1000);

  if (duration <= 60 * 60 * 1000) {
    return 30 * 1000;
  }
  if (duration <= 6 * 60 * 60 * 1000) {
    return 2 * 60 * 1000;
  }
  if (duration <= 24 * 60 * 60 * 1000) {
    return 5 * 60 * 1000;
  }
  if (duration <= 3 * 24 * 60 * 60 * 1000) {
    return 15 * 60 * 1000;
  }
  return 60 * 60 * 1000;
}

function formatBucketLabel(timestampMs, bucketMs) {
  const options = bucketMs >= 60 * 60 * 1000
    ? { month: "short", day: "numeric", hour: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" };

  return new Date(timestampMs).toLocaleTimeString([], options);
}

function normalizeLog(hit) {
  const source = hit._source || {};
  return {
    id: hit._id,
    timestamp: source.timestamp || source["@timestamp"] || null,
    level: String(source.level || "INFO").toUpperCase(),
    service: source.service || "unknown",
    message: source.message || "",
    route: source.route || source.endpoint || source.service || "unknown",
    endpoint: source.endpoint || source.route || source.service || "unknown",
    method: source.method || "GET",
    statusCode: Number(source.statusCode || 0),
    responseTime: Number(source.responseTime || 0),
    raw: source,
  };
}

function normalizeIncomingLog(log) {
  const meta = (log.meta && typeof log.meta === "object") ? log.meta : {};
  const timestamp = log.timestamp || new Date().toISOString();

  return {
    ...log,
    _receivedAt: Date.now(),
    timestamp,
    level: String(log.level || "INFO").toUpperCase(),
    message: log.message || "",
    service: log.service || "general",
    route: meta.route ?? log.route ?? null,
    method: meta.method ?? log.method ?? null,
    endpoint: meta.endpoint ?? log.endpoint ?? null,
    statusCode: meta.statusCode ?? log.statusCode ?? 200,
    responseTime: meta.responseTime ?? log.responseTime ?? null,
    traceId: meta.traceId ?? log.traceId ?? null,
    requestId: meta.requestId ?? log.requestId ?? null,
    deploymentId: meta.deploymentId ?? log.deploymentId ?? null,
    host: meta.host ?? log.host ?? null,
    meta,
  };
}

function buildWildcardShouldQuery(fields, value) {
  const normalizedValue = String(value ?? "").trim();
  if (!normalizedValue) {
    return null;
  }

  return {
    bool: {
      should: fields.map((field) => ({
        wildcard: {
          [field]: {
            value: `*${normalizedValue}*`,
            case_insensitive: true,
          },
        },
      })),
      minimum_should_match: 1,
    },
  };
}

function buildAnalyticsPayload(logs, start, end) {
  const safeLogs = logs.filter((log) => log.timestamp);
  const sortedLogs = [...safeLogs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const totalRequests = sortedLogs.length;
  const totalErrors = sortedLogs.filter((log) => log.level === "ERROR" || log.statusCode >= 500).length;
  const overallErrorPercentage = totalRequests ? (totalErrors / totalRequests) * 100 : 0;

  const routeCounts = new Map();
  sortedLogs.forEach((log) => {
    const key = log.route;
    routeCounts.set(key, (routeCounts.get(key) || 0) + 1);
  });

  const routeKeys = [...routeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key]) => key);

  const bucketMs = chooseBucketMs(start, end);
  const requestBuckets = new Map();
  const routeSparkline = new Map();
  const routeTotals = new Map();
  const routeErrors = new Map();

  sortedLogs.forEach((log) => {
    if (!routeKeys.includes(log.route)) {
      return;
    }

    const ts = new Date(log.timestamp).getTime();
    const bucket = roundBucket(ts, bucketMs);
    const requestEntry = requestBuckets.get(bucket) || { bucket, label: formatBucketLabel(bucket, bucketMs) };
    requestEntry[log.route] = (requestEntry[log.route] || 0) + 1;
    requestBuckets.set(bucket, requestEntry);

    const sparklineRouteMap = routeSparkline.get(log.route) || new Map();
    const sparklineBucket = sparklineRouteMap.get(bucket) || { bucket, total: 0, errors: 0 };
    sparklineBucket.total += 1;
    if (log.level === "ERROR" || log.statusCode >= 500) {
      sparklineBucket.errors += 1;
    }
    sparklineRouteMap.set(bucket, sparklineBucket);
    routeSparkline.set(log.route, sparklineRouteMap);

    routeTotals.set(log.route, (routeTotals.get(log.route) || 0) + 1);
    if (log.level === "ERROR" || log.statusCode >= 500) {
      routeErrors.set(log.route, (routeErrors.get(log.route) || 0) + 1);
    }
  });

  const requestRateSeries = [...requestBuckets.values()].sort((a, b) => a.bucket - b.bucket).map((entry) => {
    const row = { label: entry.label };
    routeKeys.forEach((key) => {
      row[key] = entry[key] || 0;
    });
    return row;
  });

  const latencyBuckets = new Map();

  sortedLogs.forEach((log) => {
    if (!routeKeys.includes(log.route) || !log.responseTime) {
      return;
    }

    const ts = new Date(log.timestamp).getTime();
    const bucket = roundBucket(ts, bucketMs);
    const bucketEntry = latencyBuckets.get(bucket) || { bucket, label: formatBucketLabel(bucket, bucketMs) };
    const routeMetric = bucketEntry[log.route] || { total: 0, count: 0 };
    routeMetric.total += log.responseTime;
    routeMetric.count += 1;
    bucketEntry[log.route] = routeMetric;
    latencyBuckets.set(bucket, bucketEntry);
  });

  const latencySeries = [...latencyBuckets.values()].sort((a, b) => a.bucket - b.bucket).map((entry) => {
    const row = { label: entry.label };
    routeKeys.forEach((key) => {
      const metric = entry[key];
      row[key] = metric ? Number((metric.total / metric.count).toFixed(2)) : 0;
    });
    return row;
  });

  const topLatencies = sortedLogs
    .filter((log) => log.responseTime > 0)
    .sort((a, b) => b.responseTime - a.responseTime)
    .slice(0, 10)
    .map((log) => ({
      method: log.method,
      endpoint: log.route,
      latency: log.responseTime,
    }));

  const routeStats = routeKeys.map((route) => {
    const total = routeTotals.get(route) || 0;
    const errors = routeErrors.get(route) || 0;
    const sparkline = [...(routeSparkline.get(route)?.values() || [])]
      .sort((a, b) => a.bucket - b.bucket)
      .map((entry) => ({
        label: formatBucketLabel(entry.bucket, bucketMs),
        value: entry.total ? Number(((entry.errors / entry.total) * 100).toFixed(2)) : 0,
      }));

    return {
      route,
      total,
      errorCount: errors,
      errorPercentage: total ? Number(((errors / total) * 100).toFixed(2)) : 0,
      sparkline,
    };
  });

  return {
    totalRequests,
    totalErrors,
    overallErrorPercentage: Number(overallErrorPercentage.toFixed(2)),
    routeKeys,
    routeStats,
    requestRateSeries,
    latencySeries,
    topLatencies,
    rangeLabel: start && end
      ? `${new Date(start).toLocaleString()} - ${new Date(end).toLocaleString()}`
      : "Current range",
  };
}

app.post("/log", async (req, res) => {
  try {
    const incoming = req.body;
    const logs = Array.isArray(incoming) ? incoming : [incoming];

    logs.forEach((log) => {
      const normalizedLog = normalizeIncomingLog(log);
      addLog(normalizedLog);
      const payload = { ...normalizedLog, _emittedAt: Date.now() };
      req.app.get("io").emit("new-log", payload);
    });
    res.status(200).json({ status: "stored", count: logs.length });
  } catch (err) {
    console.error("Elasticsearch error:", err);
    res.status(500).json({ error: err.message });
  }
});
app.get("/logs", async (req, res) => {
  try {
    const {
      levels,
      level,
      service,
      start,
      end,
      page = 1,
      limit = 100,
      search,
      ...rest
    } = req.query;

    const must = [];

    if (levels) {
      const levelsArray = String(levels).split(',').flatMap(l => {
        const t = l.trim();
        return [t.toUpperCase(), t.toLowerCase(), t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()];
      });
      must.push({ terms: { level: levelsArray } });
    } else if (level) {
      const t = String(level).trim();
      must.push({ terms: { level: [t.toUpperCase(), t.toLowerCase(), t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()] } });
    }

    if (service) {
      must.push({ term: { service } });
    }

    if (search) {
      const q = String(search).trim();
      const qLower = q.toLowerCase();
      const qUpper = q.toUpperCase();
      
      const fields = ["service", "level", "route", "endpoint", "method", "errorType", "fingerprint", "traceId", "requestId", "host"];
      const metaFields = ["module", "environment", "source", "errorType", "fingerprint", "traceId", "requestId", "host"];
      
      const wildcards = [];
      fields.forEach(field => {
        wildcards.push({ wildcard: { [field]: `*${q}*` } });
        if (qLower !== q) wildcards.push({ wildcard: { [field]: `*${qLower}*` } });
        if (qUpper !== q) wildcards.push({ wildcard: { [field]: `*${qUpper}*` } });
      });
      metaFields.forEach(field => {
        wildcards.push({ wildcard: { [`meta.${field}`]: `*${q}*` } });
        if (qLower !== q) wildcards.push({ wildcard: { [`meta.${field}`]: `*${qLower}*` } });
        if (qUpper !== q) wildcards.push({ wildcard: { [`meta.${field}`]: `*${qUpper}*` } });
      });

      must.push({
        bool: {
          should: [
            { match_phrase_prefix: { message: { query: q } } },
            ...wildcards
          ],
          minimum_should_match: 1,
        },
      });
    }

    Object.entries(rest).forEach(([key, value]) => {
      if (!key.startsWith("meta.") || !value) {
        return;
      }
      const field = key.replace("meta.", "");
      const query = buildWildcardShouldQuery([field, `meta.${field}`], value);
      if (query) {
        must.push(query);
      }
    });

    const range = buildTimeRange(start, end);
    if (range) {
      must.push({ range: { timestamp: range } });
    }

    const from = (parsePositiveInt(page, 1, 100000) - 1) * parsePositiveInt(limit, 100, 1000);
    const size = parsePositiveInt(limit, 100, 1000);

    const result = await client.search({
      index: READ_LOGS_INDICES,
      from,
      size,
      sort: [{ timestamp: { order: "desc" } }],
      query: must.length > 0 ? { bool: { must } } : { match_all: {} },
    });

    const logs = result.hits.hits.map((hit) => ({
      id: hit._id,
      ...hit._source,
    }));

    res.json(logs);
  } catch (err) {
    console.error("Error fetching logs:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/logs/analytics", async (req, res) => {
  try {
    const end = req.query.end || new Date().toISOString();
    const start = req.query.start || new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const size = parsePositiveInt(req.query.size, 5000, 10000);
    const range = buildTimeRange(start, end);
    const must = [];

    if (range) {
      must.push({ range: { timestamp: range } });
    }

    const result = await client.search({
      index: READ_LOGS_INDICES,
      size,
      sort: [{ timestamp: { order: "asc" } }],
      _source: ["timestamp", "level", "service", "route", "endpoint", "method", "statusCode", "responseTime", "message"],
      query: must.length ? { bool: { must } } : { match_all: {} },
    });

    const logs = result.hits.hits.map(normalizeLog);
    res.json(buildAnalyticsPayload(logs, start, end));
  } catch (err) {
    console.error("Error building analytics:", err);
    res.status(500).json({ error: err.message });
  }
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
});

// ─── ES tail-poll: watch for new docs written directly by Filebeat ──────────
// Filebeat → ES bypasses the /log endpoint, so we poll ES for new docs and
// emit socket events so the frontend gets live updates + latency metrics.
let lastSeenTimestamp = new Date().toISOString(); // only tail new docs from now

async function pollESForNewLogs() {
  const pollStart = Date.now();
  try {
    const result = await client.search({
      index: READ_LOGS_INDICES,
      size: 100,
      sort: [{ timestamp: { order: "asc", unmapped_type: "date" } }],
      query: {
        bool: {
          should: [
            { range: { "@timestamp": { gt: lastSeenTimestamp } } },
            { range: { timestamp: { gt: lastSeenTimestamp } } },
          ],
          minimum_should_match: 1,
        },
      },
    });

    const queryLatencyMs = Date.now() - pollStart;
    const hits = result.hits?.hits || [];

    if (hits.length > 0) {
      console.log(
        `[ES] 🔍 Poll: ${hits.length} new doc(s) | query=${queryLatencyMs}ms | since=${lastSeenTimestamp}`
      );

      hits.forEach((hit) => {
        const source = hit._source || {};
        const docTimestamp = source["@timestamp"] || source.timestamp;

        // Advance the cursor to the latest doc seen
        if (docTimestamp && docTimestamp > lastSeenTimestamp) {
          lastSeenTimestamp = docTimestamp;
        }

        const emittedAt = Date.now();
        const payload = {
          id: hit._id,
          ...source,
          // normalise level capitalisation
          level: String(source.level || "INFO").toUpperCase(),
          _emittedAt: emittedAt,
          _esQueryLatencyMs: queryLatencyMs,
        };

        io.emit("new-log", payload);
      });
    }
  } catch (err) {
    // ES not ready yet — stay quiet, retry next interval
    if (err?.statusCode !== 404) {
      console.error("[ES] ❌ Poll error:", err.message);
    }
  }
}

setInterval(pollESForNewLogs, 2000);
// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Log server running on ${PORT}`);
});
