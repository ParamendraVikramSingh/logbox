const client = require("../config/elasticsearch");

const WRITE_LOGS_INDEX = process.env.ELASTICSEARCH_WRITE_INDEX || "logs";

let logBuffer = [];
const BATCH_SIZE = 50;
const FLUSH_INTERVAL = 2000;
const MAX_BUFFER = 5000;

function average(values) {
  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;
}

async function flushLogs() {
  if (logBuffer.length === 0) return;

  const logsToInsert = [...logBuffer];
  logBuffer = [];
  const flushStartedAt = Date.now();

  try {
    const body = logsToInsert.flatMap((log) => {
      const meta = (log.meta && typeof log.meta === "object") ? log.meta : {};

      return [
        { index: { _index: WRITE_LOGS_INDEX, _id: log.traceId || undefined } },
        {
          timestamp: log.timestamp || new Date(),
          level: log.level || "INFO",
          message: log.message || "",
          service: log.service || "general",
          source: log.source || "unknown",
          route: meta.route ?? log.route ?? null,
          method: meta.method ?? log.method ?? null,
          endpoint: meta.endpoint ?? log.endpoint ?? null,
          statusCode: meta.statusCode ?? log.statusCode ?? 200,
          responseTime: meta.responseTime ?? log.responseTime ?? null,
          traceId: meta.traceId ?? log.traceId ?? null,
          requestId: meta.requestId ?? log.requestId ?? null,
          deploymentId: meta.deploymentId ?? log.deploymentId ?? null,
          host: meta.host ?? log.host ?? null,
          errorType: log.errorType ?? meta.errorType ?? "NONE",
          stack: meta.stack ?? log.stack ?? null,
          environment: log.environment ?? "unknown",
          eventType: meta.eventType ?? log.eventType ?? "GENERAL",
          dependency: meta.dependency ?? log.dependency ?? null,
          errorFingerprint: meta.errorFingerprint ?? log.errorFingerprint ?? null,
          severityScore: meta.severityScore ?? log.severityScore ?? 1,
          stage: meta.stage ?? log.stage ?? null,
        },
      ];
    });

    const response = await client.bulk({ refresh: true, body });
    const flushCompletedAt = Date.now();
    const bulkLatencyMs = flushCompletedAt - flushStartedAt;
    const queueLatencies = logsToInsert
      .map((log) => {
        const receivedAt = Number(log._receivedAt || 0);
        return receivedAt > 0 ? flushStartedAt - receivedAt : null;
      })
      .filter((value) => value != null);
    const totalLatencies = logsToInsert
      .map((log) => {
        const receivedAt = Number(log._receivedAt || 0);
        return receivedAt > 0 ? flushCompletedAt - receivedAt : null;
      })
      .filter((value) => value != null);

    if (response.errors) {
      const failedCount = (response.items || []).filter(
        (item) => item.index?.error
      ).length;
      console.error(
        `[ES] ⚠️  Partial index failure — ${failedCount}/${logsToInsert.length} docs failed | bulk=${bulkLatencyMs}ms | queueAvg=${average(queueLatencies)}ms | totalAvg=${average(totalLatencies)}ms`
      );
      return;
    }

    console.log(
      `[ES] ✅  Indexed ${logsToInsert.length} logs | bulk=${bulkLatencyMs}ms | queueAvg=${average(queueLatencies)}ms | totalAvg=${average(totalLatencies)}ms`
    );
  } catch (err) {
    console.error("[ES] ❌  Batch insert failed:", err.message);
  }
}

function addLog(log) {
  if (logBuffer.length >= MAX_BUFFER) {
    console.warn("Buffer overflow, dropping logs");
    return;
  }

  logBuffer.push(log);

  if (logBuffer.length >= BATCH_SIZE) {
    flushLogs();
  }
}

setInterval(flushLogs, FLUSH_INTERVAL);

module.exports = {
  addLog,
};
