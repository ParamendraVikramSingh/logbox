import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { AuthContext } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import LogToolbar from "../components/LogToolbar";
import LogTable from "../components/LogTable";
import AnalyticsOverview from "../components/AnalyticsOverview";
import IncidentCard from "../components/IncidentCard";
import RCAModal from "../components/RCAModal";
import { analyzeIncident, getGroupedIncidents } from "../services/rcaApi";
import "../styles/dashboard.css";
import "../styles/RCA.css";

const PAGE_SIZE = 50;
const SOCKET_URL = "http://localhost:4000";

const DURATION_MS = {
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "14d": 14 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  ALL: 10 * 365 * 24 * 60 * 60 * 1000,
};

const LEVEL_ALIASES = { warning: "WARN", fatal: "ERROR", critical: "ERROR" };

const LEVEL_FILTER_MAP = {
  WARN: ["WARN", "WARNING"],
  ERROR: ["ERROR"],
  FATAL: ["FATAL", "CRITICAL"],
  DEBUG: ["DEBUG"],
  INFO: ["INFO"],
};

const CLIENT_FIELD_MAP = {
  status: { field: "statusCode", numeric: true },
  statuscode: { field: "statusCode", numeric: true },
  responsetime: { field: "responseTime", numeric: true },
  method: { field: "method", numeric: false },
  route: { field: "route", numeric: false },
  endpoint: { field: "endpoint", numeric: false },
  requestid: { field: "requestId", numeric: false },
  traceid: { field: "traceId", numeric: false },
  deploymentid: { field: "deploymentId", numeric: false },
  errortype: { field: "errorType", numeric: false },
  environment: { field: "environment", numeric: false },
  source: { field: "source", numeric: false },
  host: { field: "host", numeric: false },
  module: { field: "module", numeric: false },
  fingerprint: { field: "fingerprint", numeric: false },
};

const INSIGHT_DURATION_OPTIONS = [
  { label: "Last 30 minutes", value: "30m", ms: 30 * 60 * 1000 },
  { label: "Last hour", value: "1h", ms: 60 * 60 * 1000 },
  { label: "Last 6 hours", value: "6h", ms: 6 * 60 * 60 * 1000 },
  { label: "Last 12 hours", value: "12h", ms: 12 * 60 * 60 * 1000 },
  { label: "Last day", value: "1d", ms: 24 * 60 * 60 * 1000 },
  { label: "Last 3 days", value: "3d", ms: 3 * 24 * 60 * 60 * 1000 },
  { label: "Last week", value: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "Last 2 weeks", value: "14d", ms: 14 * 24 * 60 * 60 * 1000 },
  { label: "Last 30 days", value: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
  { label: "All time", value: "ALL", ms: 10 * 365 * 24 * 60 * 60 * 1000 },
];

const ANALYTICS_DURATION_OPTIONS = [
  { label: "Last 30 minutes", value: "30m" },
  { label: "Last hour", value: "1h" },
  { label: "Last 6 hours", value: "6h" },
  { label: "Last 12 hours", value: "12h" },
  { label: "Last day", value: "1d" },
  { label: "Last 3 days", value: "3d" },
  { label: "Last week", value: "7d" },
  { label: "Last 2 weeks", value: "14d" },
  { label: "Last 30 days", value: "30d" },
  { label: "All time", value: "ALL" },
];

function getWindowForDuration(value) {
  const selected = INSIGHT_DURATION_OPTIONS.find(
    (option) => option.value === value,
  );
  const durationMs = selected?.ms || 24 * 60 * 60 * 1000;
  const to = new Date();
  const from = new Date(to.getTime() - durationMs);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function normalizeLevelForFilter(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (!normalized) {
    return "";
  }

  if (normalized === "WARNING") {
    return "WARN";
  }

  if (normalized === "CRITICAL") {
    return "FATAL";
  }

  return normalized;
}

function expandLevelFilters(levels = []) {
  return levels.flatMap((level) => LEVEL_FILTER_MAP[level] || [level]);
}

function InsightsPanel({
  duration,
  onDurationChange,
  incidents,
  loadingIncidents,
  incidentsError,
  onRefresh,
  onAnalyze,
  analysisLoadingFor,
  selectedIncident,
  selectedAnalysis,
  analysisError,
  onCloseAnalysis,
  timeWindow,
  sidebarOpen,
  onOpenSidebar,
}) {
  return (
    <div className="section-scroll-page">
      {!sidebarOpen && (
        <button
          className="page-sidebar-open-btn icon-btn"
          onClick={onOpenSidebar}
          title="Open Workspace"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      )}

      <section className="rca-hero">
        <div>
          <span className="rca-hero-eyebrow">Insights</span>
          <h1>Grouped incidents with RCA</h1>
          <p>
            Review recurring failures, then open one incident to generate an
            explanation with evidence, blast radius, and next-step fixes.
          </p>
        </div>

        <div className="rca-controls">
          <label className="rca-duration-field">
            <span>Time Window</span>
            <select
              value={duration}
              onChange={(event) => onDurationChange(event.target.value)}
            >
              {INSIGHT_DURATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            className="rca-refresh-btn"
            onClick={onRefresh}
            disabled={loadingIncidents}
          >
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
            Range: {new Date(timeWindow.from).toLocaleString()} to{" "}
            {new Date(timeWindow.to).toLocaleString()}
          </p>
        </div>

        {incidentsError && (
          <div className="rca-inline-error">{incidentsError}</div>
        )}

        {!loadingIncidents && incidents.length === 0 && !incidentsError && (
          <div className="rca-empty-state">
            <h3>No grouped incidents found</h3>
            <p>
              Try widening the time range or refresh after more logs arrive.
            </p>
          </div>
        )}

        <div className="rca-grid">
          {incidents.map((incident) => (
            <IncidentCard
              key={incident.fingerprint}
              incident={incident}
              onAnalyze={onAnalyze}
              loading={analysisLoadingFor === incident.fingerprint}
            />
          ))}
        </div>
      </section>

      <RCAModal
        incident={selectedIncident}
        analysis={selectedAnalysis}
        loading={
          Boolean(selectedIncident) &&
          analysisLoadingFor === selectedIncident.fingerprint
        }
        error={analysisError}
        onClose={onCloseAnalysis}
      />
    </div>
  );
}

function AnalyticsPanel({
  startTime,
  analyticsVersion,
  onRefresh,
  sidebarOpen,
  onOpenSidebar,
  analyticsDuration,
  onAnalyticsDurationChange,
}) {
  return (
    <div className="section-scroll-page analytics-page">
      {!sidebarOpen && (
        <button
          className="page-sidebar-open-btn icon-btn"
          onClick={onOpenSidebar}
          title="Open Workspace"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      )}

      <AnalyticsOverview
        startTime={startTime}
        version={analyticsVersion}
        sidebarOpen={sidebarOpen}
        onOpenSidebar={onOpenSidebar}
        analyticsDuration={analyticsDuration}
        onAnalyticsDurationChange={onAnalyticsDurationChange}
        analyticsDurationOptions={ANALYTICS_DURATION_OPTIONS}
      />
      <div className="section-footer-actions">
        <button className="analytics-refresh-btn" onClick={onRefresh}>
          Refresh Analytics
        </button>
      </div>
    </div>
  );
}

function AdminDashboard({ initialSection = "logs" }) {
  const { user, logout } = useContext(AuthContext);

  const [logs, setLogs] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [viewMode, setViewMode] = useState("raw");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState(initialSection);
  const [analyticsVersion, setAnalyticsVersion] = useState(0);
  const [analyticsDuration, setAnalyticsDuration] = useState("ALL");

  const [insightsDuration, setInsightsDuration] = useState("ALL");
  const [insightsIncidents, setInsightsIncidents] = useState([]);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState("");
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [analysisByFingerprint, setAnalysisByFingerprint] = useState({});
  const [analysisLoadingFor, setAnalysisLoadingFor] = useState("");
  const [analysisError, setAnalysisError] = useState("");

  const [filters, setFilters] = useState({
    duration: "ALL",
    search: "",
    levels: [],
    statusCodes: [],
    environments: [],
    route: "",
    resource: "",
    service: "",
    _userName: user?.name || "user",
  });

  const logsStartTime = useMemo(() => {
    if (filters.duration === "ALL") {
      return null;
    }

    const ms = DURATION_MS[filters.duration];
    return ms ? new Date(Date.now() - ms).toISOString() : null;
  }, [filters.duration]);

  const analyticsStartTime = useMemo(() => {
    if (analyticsDuration === "ALL") {
      return new Date(0).toISOString();
    }

    const ms = DURATION_MS[analyticsDuration];
    return ms ? new Date(Date.now() - ms).toISOString() : null;
  }, [analyticsDuration]);

  const insightsTimeWindow = useMemo(
    () => getWindowForDuration(insightsDuration),
    [insightsDuration],
  );

  const parsedSearch = useMemo(() => {
    const result = { level: null, service: null, meta: {}, freeText: "" };
    const freeTokens = [];

    for (const token of searchQuery.trim().split(/\s+/)) {
      if (!token) {
        continue;
      }

      const colonIdx = token.indexOf(":");
      if (colonIdx > 0) {
        const key = token.slice(0, colonIdx).toLowerCase();
        const value = token.slice(colonIdx + 1);

        if (!value) {
          freeTokens.push(token);
          continue;
        }

        if (key === "level") {
          const raw = value.toUpperCase();
          result.level = normalizeLevelForFilter(
            LEVEL_ALIASES[raw.toLowerCase()] ?? raw,
          );
        } else if (key === "service") {
          result.service = value;
        } else {
          result.meta[key] = value;
        }
      } else {
        freeTokens.push(token);
      }
    }

    result.freeText = freeTokens.join(" ");
    return result;
  }, [searchQuery]);

  const fetchPage = useCallback(
    async (pageNum, reset = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: pageNum, limit: PAGE_SIZE });
        if (logsStartTime) {
          params.set("start", logsStartTime);
        }

        const selectedLevels = parsedSearch.level
          ? [parsedSearch.level]
          : filters.levels;
        const backendLevels =
          expandLevelFilters(selectedLevels).filter(Boolean);
        const serviceParam = parsedSearch.service || filters.service || null;

        if (parsedSearch.freeText) {
          params.set("search", parsedSearch.freeText);
        }
        if (backendLevels.length > 0) {
          params.set("levels", backendLevels.join(","));
        }
        if (serviceParam) {
          params.set("service", serviceParam);
        }

        for (const [key, value] of Object.entries(parsedSearch.meta)) {
          if (value) {
            const mapping = CLIENT_FIELD_MAP[key.toLowerCase()];
            const backendField = mapping?.field ?? key;
            params.set(`meta.${backendField}`, value);
          }
        }

        const response = await fetch(`${SOCKET_URL}/logs?${params.toString()}`);
        const data = await response.json();
        setLogs((prev) => (reset ? data : [...prev, ...data]));
        setHasMore(Array.isArray(data) && data.length === PAGE_SIZE);
      } catch (error) {
        console.error("Fetch error:", error);
      } finally {
        setLoading(false);
      }
    },
    [filters.levels, filters.service, logsStartTime, parsedSearch],
  );

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const selectedLevels = parsedSearch.level
        ? [parsedSearch.level]
        : filters.levels;
      const backendLevels = expandLevelFilters(selectedLevels).filter(Boolean);
      const routeParam = parsedSearch.meta.route || filters.route || "";
      const moduleParam = parsedSearch.meta.module || "";

      if (backendLevels.length > 0) {
        params.set("levels", backendLevels.join(",").toLowerCase());
      }
      if (routeParam) {
        params.set("route", routeParam);
      }
      if (moduleParam) {
        params.set("module", moduleParam);
      }
      if (logsStartTime) {
        params.set("from", logsStartTime);
      }
      params.set("to", new Date().toISOString());

      const response = await fetch(
        `${SOCKET_URL}/rca/incidents?${params.toString()}`,
      );
      const data = await response.json();
      setIncidents(data.incidents || []);
      setHasMore(false);
    } catch (error) {
      console.error("Fetch incidents error:", error);
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }, [
    filters.levels,
    filters.route,
    logsStartTime,
    parsedSearch.level,
    parsedSearch.meta.module,
    parsedSearch.meta.route,
  ]);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    setPage(1);
    if (viewMode === "grouped") {
      fetchIncidents();
      return;
    }
    fetchPage(1, true);
  }, [fetchIncidents, fetchPage, viewMode]);

  useEffect(() => {
    if (!isLive || viewMode !== "raw") {
      return undefined;
    }

    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socket.on("new-log", (log) => {
      const receivedAt = Date.now();
      const socketLatencyMs = log._emittedAt ? receivedAt - log._emittedAt : null;
      const esLatencyMs = log._esQueryLatencyMs ?? null;
      console.log(
        `[Socket] 📡 new-log | socket=${socketLatencyMs != null ? socketLatencyMs + "ms" : "n/a"} | es_query=${esLatencyMs != null ? esLatencyMs + "ms" : "n/a"} | service=${log.service || "?"} level=${log.level || "?"} | msg="${String(log.message || "").slice(0, 60)}"`
      );

      const logTimestamp = log.timestamp || log["@timestamp"];
      if (
        logsStartTime &&
        logTimestamp &&
        new Date(logTimestamp) < new Date(logsStartTime)
      ) {
        return;
      }
      setLogs((prev) => [log, ...prev]);
    });

    return () => socket.disconnect();
  }, [isLive, logsStartTime, viewMode]);

  const loadInsights = useCallback(async () => {
    setLoadingInsights(true);
    setInsightsError("");

    try {
      const payload = await getGroupedIncidents(insightsTimeWindow);
      setInsightsIncidents(payload.incidents || []);
    } catch (error) {
      setInsightsIncidents([]);
      setInsightsError(error.message || "Failed to load incidents");
    } finally {
      setLoadingInsights(false);
    }
  }, [insightsTimeWindow]);

  useEffect(() => {
    if (activeSection !== "insights") {
      return;
    }
    loadInsights();
  }, [activeSection, loadInsights]);

  const handleAnalyzeIncident = useCallback(
    async (incident) => {
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
          ...insightsTimeWindow,
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
    },
    [analysisByFingerprint, insightsTimeWindow],
  );

  const handleLoadMore = useCallback(() => {
    if (viewMode === "grouped") {
      fetchIncidents();
      return;
    }

    const nextPage = page + 1;
    setPage(nextPage);
    fetchPage(nextPage, false);
  }, [fetchIncidents, fetchPage, page, viewMode]);

  const handleRefresh = useCallback(() => {
    setPage(1);
    if (viewMode === "grouped") {
      fetchIncidents();
      return;
    }
    fetchPage(1, true);
  }, [fetchIncidents, fetchPage, viewMode]);

  const filteredLogs = useMemo(() => {
    let result = logs;

    const activeLevels = parsedSearch.level
      ? [parsedSearch.level]
      : filters.levels;
    if (activeLevels.length > 0) {
      result = result.filter((log) =>
        activeLevels.includes(normalizeLevelForFilter(log.level)),
      );
    }

    const activeService = parsedSearch.service || filters.service;
    if (activeService) {
      result = result.filter(
        (log) => log.service?.toLowerCase() === activeService.toLowerCase(),
      );
    }

    for (const [key, value] of Object.entries(parsedSearch.meta)) {
      if (!value) {
        continue;
      }

      const mapping = CLIENT_FIELD_MAP[key.toLowerCase()];
      const fieldName = mapping?.field ?? key;

      result = result.filter((log) => {
        const fieldVal = log[fieldName] ?? log.meta?.[fieldName];
        if (fieldVal == null) {
          return false;
        }
        if (mapping?.numeric) {
          return Number(fieldVal) === Number(value);
        }
        return String(fieldVal).toLowerCase().includes(value.toLowerCase());
      });
    }

    if (parsedSearch.freeText) {
      const query = parsedSearch.freeText.toLowerCase();
      result = result.filter(
        (log) =>
          log.message?.toLowerCase().includes(query) ||
          log.service?.toLowerCase().includes(query) ||
          log.route?.toLowerCase().includes(query) ||
          log.endpoint?.toLowerCase().includes(query) ||
          log.method?.toLowerCase().includes(query) ||
          log.level?.toLowerCase().includes(query) ||
          log.errorType?.toLowerCase().includes(query) ||
          log.fingerprint?.toLowerCase().includes(query) ||
          log.traceId?.toLowerCase().includes(query) ||
          log.requestId?.toLowerCase().includes(query) ||
          log.host?.toLowerCase().includes(query) ||
          Object.values(log.meta || {}).some((value) =>
            String(value).toLowerCase().includes(query),
          ),
      );
    }

    return result;
  }, [filters.levels, filters.service, logs, parsedSearch]);

  const handleExport = () => {
    const payload = viewMode === "grouped" ? incidents : filteredLogs;
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const suffix = viewMode === "grouped" ? "incidents" : "logs";
    link.href = url;
    link.download = `logbox-${suffix}-${new Date().toISOString().slice(0, 19)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const logCounts = useMemo(() => {
    const counts = { WARN: 0, ERROR: 0, FATAL: 0 };
    logs.forEach((log) => {
      const normalizedLevel = normalizeLevelForFilter(log.level);
      if (counts[normalizedLevel] !== undefined) {
        counts[normalizedLevel] += 1;
      }
    });
    return counts;
  }, [logs]);

  const selectedAnalysis = selectedIncident
    ? analysisByFingerprint[selectedIncident.fingerprint]
    : null;

  const handleSectionChange = useCallback((section) => {
    setActiveSection(section);
    if (section === "logs") {
      setSidebarOpen(true);
    }
  }, []);

  const titleMap = {
    logs: "Logs",
    analytics: "Analytics",
    insights: "Insights",
  };

  return (
    <div className="vdash">
      <Navbar user={user} logout={logout} title={titleMap[activeSection]} />

      <div className="vdash-body">
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen((prev) => !prev)}
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
          filters={filters}
          onFilterChange={setFilters}
          logCounts={logCounts}
        />

        <main className="vdash-main">
          {activeSection === "logs" && (
            <>
              <LogToolbar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                isLive={isLive}
                onToggleLive={() => setIsLive((prev) => !prev)}
                viewMode={viewMode}
                onToggleGrouped={() =>
                  setViewMode((prev) =>
                    prev === "grouped" ? "raw" : "grouped",
                  )
                }
                onRefresh={handleRefresh}
                onExport={handleExport}
                loading={loading}
                sidebarOpen={sidebarOpen}
                onToggleSidebar={() => setSidebarOpen(true)}
              />

              <LogTable
                logs={viewMode === "grouped" ? incidents : filteredLogs}
                hasMore={hasMore}
                loading={loading}
                onLoadMore={handleLoadMore}
                viewMode={viewMode}
                onIncidentClick={(incident) => {
                  if (incident.syntheticFilter) {
                    setSearchQuery(incident.syntheticFilter);
                  } else {
                    setSearchQuery(`fingerprint:${incident.fingerprint}`);
                  }
                  setViewMode("raw");
                  setSidebarOpen(true);
                }}
              />
            </>
          )}

          {activeSection === "analytics" && (
            <AnalyticsPanel
              startTime={analyticsStartTime}
              analyticsVersion={analyticsVersion}
              onRefresh={() => setAnalyticsVersion((prev) => prev + 1)}
              sidebarOpen={sidebarOpen}
              onOpenSidebar={() => setSidebarOpen(true)}
              analyticsDuration={analyticsDuration}
              onAnalyticsDurationChange={setAnalyticsDuration}
            />
          )}

          {activeSection === "insights" && (
            <InsightsPanel
              duration={insightsDuration}
              onDurationChange={setInsightsDuration}
              incidents={insightsIncidents}
              loadingIncidents={loadingInsights}
              incidentsError={insightsError}
              onRefresh={loadInsights}
              onAnalyze={handleAnalyzeIncident}
              analysisLoadingFor={analysisLoadingFor}
              selectedIncident={selectedIncident}
              selectedAnalysis={selectedAnalysis}
              analysisError={analysisError}
              onCloseAnalysis={() => {
                setSelectedIncident(null);
                setAnalysisError("");
              }}
              timeWindow={insightsTimeWindow}
              sidebarOpen={sidebarOpen}
              onOpenSidebar={() => setSidebarOpen(true)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default AdminDashboard;
