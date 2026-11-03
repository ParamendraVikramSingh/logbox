import { useEffect } from "react";
import "../styles/RCAModal.css";

function renderList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return <p className="rca-modal-muted">No items available.</p>;
  }

  return (
    <ul className="rca-modal-list">
      {items.map((item, index) => (
        <li key={`${index}-${String(item)}`}>
          {typeof item === "string" ? item : JSON.stringify(item)}
        </li>
      ))}
    </ul>
  );
}

function renderMap(map) {
  if (!map || typeof map !== "object" || Array.isArray(map) || Object.keys(map).length === 0) {
    return <p className="rca-modal-muted">No aggregated context available.</p>;
  }

  return (
    <div className="rca-kv-grid">
      {Object.entries(map).map(([key, value]) => (
        <div key={key} className="rca-kv-item">
          <span className="rca-kv-label">{key}</span>
          <span className="rca-kv-value">{String(value)}</span>
        </div>
      ))}
    </div>
  );
}

function renderBucketList(items, keyName) {
  if (!Array.isArray(items) || items.length === 0) {
    return <p className="rca-modal-muted">No impacted entities found.</p>;
  }

  return (
    <ul className="rca-modal-list compact">
      {items.map((item) => (
        <li key={`${item[keyName]}-${item.count}`}>
          <span>{item[keyName]}</span>
          <strong>{item.count}</strong>
        </li>
      ))}
    </ul>
  );
}

function RCAModal({ incident, analysis, loading, error, onClose }) {
  useEffect(() => {
    if (!incident) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [incident, onClose]);

  if (!incident) return null;

  const aiRca = analysis?.aiRca || {};
  const context = analysis?.context || {};

  return (
    <div className="rca-modal-backdrop" onClick={onClose}>
      <aside className="rca-modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="rca-modal-header">
          <div>
            <span className="rca-modal-eyebrow">AI Root Cause Analysis</span>
            <h2>{incident.title}</h2>
            <p>{incident.fingerprint}</p>
          </div>
          <button className="rca-modal-close" onClick={onClose} aria-label="Close RCA details">
            ×
          </button>
        </div>

        {loading && (
          <div className="rca-modal-state">
            <div className="rca-modal-spinner" />
            <p>Generating RCA from grouped incident context...</p>
          </div>
        )}

        {!loading && error && (
          <div className="rca-modal-state error">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && analysis && (
          <div className="rca-modal-content">
            <section className="rca-modal-section">
              <div className="rca-summary-grid">
                <div className="rca-summary-card">
                  <span>Summary</span>
                  <p>{aiRca.incident_summary || "No summary returned."}</p>
                </div>
                <div className="rca-summary-card">
                  <span>Likely Root Cause</span>
                  <p>{aiRca.likely_root_cause || "No root cause returned."}</p>
                </div>
                <div className="rca-summary-card">
                  <span>Confidence</span>
                  <p>{aiRca.confidence != null ? `${aiRca.confidence}%` : "Unknown"}</p>
                </div>
                <div className="rca-summary-card">
                  <span>Blast Radius</span>
                  <p>{aiRca.blast_radius || "Unknown"}</p>
                </div>
              </div>
            </section>

            <section className="rca-modal-section">
              <h3>Evidence</h3>
              {renderList(aiRca.evidence)}
            </section>

            <section className="rca-modal-section">
              <h3>Recommended Fixes</h3>
              {renderList(aiRca.recommended_fixes)}
            </section>

            <section className="rca-modal-section">
              <h3>Preventive Actions</h3>
              {renderList(aiRca.preventive_actions)}
            </section>

            <section className="rca-modal-section">
              <h3>Incident Context</h3>
              <div className="rca-kv-grid">
                <div className="rca-kv-item">
                  <span className="rca-kv-label">Occurrences</span>
                  <span className="rca-kv-value">{context.totalOccurrences || 0}</span>
                </div>
                <div className="rca-kv-item">
                  <span className="rca-kv-label">First Seen</span>
                  <span className="rca-kv-value">{context.firstSeen ? new Date(context.firstSeen).toLocaleString() : "-"}</span>
                </div>
                <div className="rca-kv-item">
                  <span className="rca-kv-label">Last Seen</span>
                  <span className="rca-kv-value">{context.lastSeen ? new Date(context.lastSeen).toLocaleString() : "-"}</span>
                </div>
                <div className="rca-kv-item">
                  <span className="rca-kv-label">Service</span>
                  <span className="rca-kv-value">{context.suspectedService || "-"}</span>
                </div>
              </div>
            </section>

            <section className="rca-modal-section">
              <h3>Affected Routes</h3>
              {renderBucketList(context.affectedRoutes, "route")}
            </section>

            <section className="rca-modal-section">
              <h3>Affected Modules</h3>
              {renderBucketList(context.affectedModules, "module")}
            </section>

            <section className="rca-modal-section">
              <h3>Status Codes</h3>
              {renderMap(context.statusCodes)}
            </section>

            <section className="rca-modal-section">
              <h3>Levels</h3>
              {renderMap(context.levels)}
            </section>

            <section className="rca-modal-section">
              <h3>Timeline</h3>
              {renderList(context.timeline)}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

export default RCAModal;
