import { useState, useRef, useEffect } from "react";
import "../styles/LogTable.css";

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return (
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) +
    "." +
    String(d.getMilliseconds()).padStart(3, "0")
  );
}

function fmtDateTime(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString();
}

function LogTable({ logs, hasMore, loading, onLoadMore, viewMode = "raw", onIncidentClick }) {
  const [expandedRow, setExpandedRow] = useState(null);
  const tableRef = useRef(null);
  const isGroupedView = viewMode === "grouped";

  const toggleRow = (idx) => setExpandedRow((prev) => (prev === idx ? null : idx));

  useEffect(() => {
    if (isGroupedView) return undefined;
    const el = tableRef.current;
    if (!el) return undefined;

    const handler = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60 && hasMore && !loading) {
        onLoadMore();
      }
    };

    el.addEventListener("scroll", handler);
    return () => el.removeEventListener("scroll", handler);
  }, [hasMore, isGroupedView, loading, onLoadMore]);

  if (logs.length === 0 && !loading) {
    return (
      <div className="lt-empty">
        <div className="lt-empty-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="9" x2="15" y2="15" />
            <line x1="15" y1="9" x2="9" y2="15" />
          </svg>
        </div>
        <p className="lt-empty-title">
          {isGroupedView ? "There are no grouped incidents for this filter set" : "There are no runtime logs in this time range"}
        </p>
        <div className="lt-empty-actions">
          <button className="lt-empty-btn primary" onClick={onLoadMore}>Refresh Query</button>
          <button className="lt-empty-btn">Learn More</button>
        </div>
      </div>
    );
  }

  return (
    <div className="lt-wrap" ref={tableRef}>
      {!isGroupedView && (
        <>
          <div className="lt-timeline-bar">
            <div className="lt-timeline-line" />
          </div>

          <div className="lt-header">
            <span className="lt-h lt-h-time">Time</span>
            <span className="lt-h lt-h-status">Status</span>
            <span className="lt-h lt-h-host">Host</span>
            <span className="lt-h lt-h-request">Request</span>
            <span className="lt-h lt-h-message">Messages</span>
          </div>
        </>
      )}

      <div className="lt-rows">
        {isGroupedView ? (
          <IncidentTable incidents={logs} onIncidentClick={onIncidentClick} />
        ) : (
          logs.map((log, idx) => (
            <div key={log._id || idx} className="lt-row-wrap">
              <button
                className={`lt-row ${expandedRow === idx ? "expanded" : ""}`}
                onClick={() => toggleRow(idx)}
              >
                <span className="lt-c lt-c-time">{fmtTime(log.timestamp)}</span>
                <span className="lt-c lt-c-status">{log.level}</span>
                <span className="lt-c lt-c-host">{log.service || "-"}</span>
                <span className="lt-c lt-c-request">{log.meta?.route || log.route || log.meta?.method || log.method || "-"}</span>
                <span className="lt-c lt-c-message">{log.message}</span>
              </button>

              {expandedRow === idx && <LogDetailPanel log={log} />}
            </div>
          ))
        )}

        {loading && (
          <div className="lt-loading">
            <div className="lt-spinner" />
            <span>Loading...</span>
          </div>
        )}

        {!isGroupedView && !hasMore && logs.length > 0 && (
          <div className="lt-end">All logs loaded - {logs.length.toLocaleString()} total</div>
        )}
      </div>
    </div>
  );
}

function IncidentTable({ incidents, onIncidentClick }) {
  return (
    <div className="lt-incident-table-wrap">
      <table className="lt-incident-table">
        <thead>
          <tr>
            <th>Error</th>
            <th>Count</th>
            <th>Route</th>
            <th>Method</th>
            <th>First Seen</th>
            <th>Last Seen</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((incident) => (
            <tr
              key={incident.fingerprint}
              onClick={() => onIncidentClick && onIncidentClick(incident)}
              style={{ cursor: onIncidentClick ? "pointer" : "default" }}
            >
              <td>{incident.title}</td>
              <td>{incident.count}</td>
              <td>{incident.route || "-"}</td>
              <td>{incident.method || "-"}</td>
              <td>{fmtDateTime(incident.firstSeen)}</td>
              <td>{fmtDateTime(incident.lastSeen)}</td>
              <td>
                <span className={`lt-incident-severity severity-${String(incident.severity || "high").toLowerCase()}`}>
                  {incident.severity || "high"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogDetailPanel({ log }) {
  const [copied, setCopied] = useState(false);

  const meta = log.meta || log;
  const rawJson = JSON.stringify(log, null, 2);

  const level = String(log.level || "").toLowerCase();
  const levelClass =
    level === "error" ? "ld-badge--error"
    : level === "warn" ? "ld-badge--warn"
    : level === "info" ? "ld-badge--info"
    : level === "debug" ? "ld-badge--debug"
    : "ld-badge--default";

  const copyJson = () => {
    navigator.clipboard.writeText(rawJson).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const statusCode = meta.statusCode ?? meta.status ?? meta.statuscode ?? null;
  const method = meta.method ?? meta.requestMethod ?? null;
  const route = meta.route ?? meta.path ?? meta.url ?? null;
  const host = meta.host ?? log.service ?? null;
  const requestId = meta.requestId ?? meta.request_id ?? null;
  const traceId = meta.traceId ?? meta.trace_id ?? null;
  const deployId = meta.deploymentId ?? meta.deployId ?? meta.deployment_id ?? null;
  const respTime = meta.responseTime ?? meta.duration ?? meta.latency ?? null;
  const stackTrace = meta.stack ?? meta.stackTrace ?? log.stack ?? null;

  const Field = ({ label, value }) => {
    if (value == null || value === "") return null;
    return (
      <div className="ld-field">
        <span className="ld-label">{label}</span>
        <span className="ld-value">{String(value)}</span>
      </div>
    );
  };

  return (
    <div className="lt-detail">
      <div className="ld-header-row">
        <span className={`ld-badge ${levelClass}`}>{String(log.level || "").toUpperCase()}</span>
        <span className="ld-timestamp">
          {log.timestamp ? new Date(log.timestamp).toISOString() : "-"}
        </span>
        <span className="ld-spacer" />
        <button className="ld-copy-btn" onClick={copyJson} title="Copy raw JSON">
          {copied ? (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
              <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
            </svg>
          )}
          <span>{copied ? "Copied!" : "Copy JSON"}</span>
        </button>
      </div>

      <div className="ld-divider" />

      <div className="ld-grid">
        <Field label="Service / Host" value={host} />
        <Field label="Route" value={route} />
        <Field label="Method" value={method} />
        <Field label="Status Code" value={statusCode} />
        <Field label="Response Time" value={respTime != null ? `${respTime} ms` : null} />
        <Field label="Request ID" value={requestId} />
        <Field label="Trace ID" value={traceId} />
        <Field label="Deployment ID" value={deployId} />
      </div>

      <div className="ld-section-label">Message</div>
      <pre className="ld-msg-pre">{log.message}</pre>

      <div className="ld-section-label">Raw JSON</div>
      <pre className="ld-json-pre">{rawJson}</pre>

      {stackTrace && (
        <>
          <div className="ld-section-label ld-section-label--error">Stack Trace</div>
          <pre className="ld-stack-pre">{stackTrace}</pre>
        </>
      )}
    </div>
  );
}

export default LogTable;
