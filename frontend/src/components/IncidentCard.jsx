import "../styles/IncidentCard.css";

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function IncidentCard({ incident, onAnalyze, loading = false }) {
  return (
    <article className="rca-card">
      <div className="rca-card-header">
        <div>
          <span className={`rca-severity-pill severity-${String(incident.severity || "high").toLowerCase()}`}>
            {incident.severity || "high"}
          </span>
          <h3 className="rca-card-title">{incident.title}</h3>
        </div>
        <div className="rca-card-count">
          <span className="rca-card-count-value">{incident.count}</span>
          <span className="rca-card-count-label">occurrences</span>
        </div>
      </div>

      <dl className="rca-card-meta">
        <div>
          <dt>Route</dt>
          <dd>{incident.route || "-"}</dd>
        </div>
        <div>
          <dt>Method</dt>
          <dd>{incident.method || "-"}</dd>
        </div>
        <div>
          <dt>Module</dt>
          <dd>{incident.module || "-"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{incident.statusCode || "-"}</dd>
        </div>
        <div>
          <dt>First Seen</dt>
          <dd>{formatDateTime(incident.firstSeen)}</dd>
        </div>
        <div>
          <dt>Last Seen</dt>
          <dd>{formatDateTime(incident.lastSeen)}</dd>
        </div>
      </dl>

      <div className="rca-card-footer">
        <code className="rca-card-fingerprint">{incident.fingerprint}</code>
        <button className="rca-analyze-btn" onClick={() => onAnalyze(incident)} disabled={loading}>
          {loading ? "Analyzing..." : "Analyze RCA"}
        </button>
      </div>
    </article>
  );
}

export default IncidentCard;
