import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import IncidentCard from "../components/IncidentCard";
import RCAModal from "../components/RCAModal";
import { AuthContext } from "../context/AuthContext";
import { analyzeIncident, getGroupedIncidents } from "../services/rcaApi";
import "../styles/RCA.css";

const DURATION_OPTIONS = [
  { label: "Last 30 minutes", value: "30m", ms: 30 * 60 * 1000 },
  { label: "Last hour", value: "1h", ms: 60 * 60 * 1000 },
  { label: "Last 6 hours", value: "6h", ms: 6 * 60 * 60 * 1000 },
  { label: "Last 12 hours", value: "12h", ms: 12 * 60 * 60 * 1000 },
  { label: "Last day", value: "1d", ms: 24 * 60 * 60 * 1000 },
  { label: "Last 3 days", value: "3d", ms: 3 * 24 * 60 * 60 * 1000 },
  { label: "Last week", value: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
];

const DEFAULT_DURATION = "24h";

function getWindowForDuration(value) {
  const selected = DURATION_OPTIONS.find((option) => option.value === value);
  const durationMs = selected?.ms || 24 * 60 * 60 * 1000;
  const to = new Date();
  const from = new Date(to.getTime() - durationMs);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function RCA() {
  const { user, logout } = useContext(AuthContext);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [incidents, setIncidents] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [incidentsError, setIncidentsError] = useState("");
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [analysisByFingerprint, setAnalysisByFingerprint] = useState({});
  const [analysisLoadingFor, setAnalysisLoadingFor] = useState("");
  const [analysisError, setAnalysisError] = useState("");

  const timeWindow = useMemo(() => getWindowForDuration(duration), [duration]);

  const loadIncidents = useCallback(async () => {
    setLoadingIncidents(true);
    setIncidentsError("");

    try {
      const payload = await getGroupedIncidents(timeWindow);
      setIncidents(payload.incidents || []);
    } catch (error) {
      setIncidents([]);
      setIncidentsError(error.message || "Failed to load incidents");
    } finally {
      setLoadingIncidents(false);
    }
  }, [timeWindow]);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  const handleAnalyze = useCallback(async (incident) => {
    setSelectedIncident(incident);
    setAnalysisError("");

    if (analysisByFingerprint[incident.fingerprint]) {
      return;
    }

    setAnalysisLoadingFor(incident.fingerprint);

    try {
      const payload = await analyzeIncident({
        fingerprint: incident.fingerprint,
        syntheticFilter: incident.syntheticFilter,
        ...timeWindow,
      });

      setAnalysisByFingerprint((prev) => ({
        ...prev,
        [incident.fingerprint]: payload,
      }));
    } catch (error) {
      setAnalysisError(error.message || "Failed to analyze incident");
    } finally {
      setAnalysisLoadingFor("");
    }
  }, [analysisByFingerprint, timeWindow]);

  const selectedAnalysis = selectedIncident ? analysisByFingerprint[selectedIncident.fingerprint] : null;

  return (
    <div className="rca-page-shell">
      <Navbar user={user} logout={logout} title="Root Cause Analysis" />

      <main className="rca-page">
        <section className="rca-hero">
          <div>
            <span className="rca-hero-eyebrow">Incident Analysis</span>
            <h1>Grouped incidents with RCA</h1>
            <p>
              Review recurring failures, then open one incident to generate an explanation with evidence,
              blast radius, and next-step fixes.
            </p>
          </div>

          <div className="rca-controls">
            <label className="rca-duration-field">
              <span>Time Window</span>
              <select value={duration} onChange={(event) => setDuration(event.target.value)}>
                <option value={DEFAULT_DURATION}>Last 24 hours</option>
                {DURATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button className="rca-refresh-btn" onClick={loadIncidents} disabled={loadingIncidents}>
              {loadingIncidents ? "Refreshing..." : "Refresh Incidents"}
            </button>
          </div>
        </section>

        <section className="rca-results">
          <div className="rca-results-head">
            <div>
              <span className="rca-results-label">Grouped Incidents</span>
              <h2>{incidents.length} incidents ready for analysis</h2>
            </div>
            <p>
              Range: {new Date(timeWindow.from).toLocaleString()} to {new Date(timeWindow.to).toLocaleString()}
            </p>
          </div>

          {incidentsError && <div className="rca-inline-error">{incidentsError}</div>}

          {!loadingIncidents && incidents.length === 0 && !incidentsError && (
            <div className="rca-empty-state">
              <h3>No grouped incidents found</h3>
              <p>Try widening the time range or refresh after more logs arrive.</p>
            </div>
          )}

          <div className="rca-grid">
            {incidents.map((incident) => (
              <IncidentCard
                key={incident.fingerprint}
                incident={incident}
                onAnalyze={handleAnalyze}
                loading={analysisLoadingFor === incident.fingerprint}
              />
            ))}
          </div>
        </section>
      </main>

      <RCAModal
        incident={selectedIncident}
        analysis={selectedAnalysis}
        loading={Boolean(selectedIncident) && analysisLoadingFor === selectedIncident.fingerprint}
        error={analysisError}
        onClose={() => {
          setSelectedIncident(null);
          setAnalysisError("");
        }}
      />
    </div>
  );
}

export default RCA;
