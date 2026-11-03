import { useRef, useEffect, useState, useCallback } from "react";
import "../styles/LogToolbar.css";

const FILTER_CHIPS = [
  { label: "level:", hint: "Log level" },
  { label: "service:", hint: "Service name" },
  { label: "module:", hint: "Module name" },
  { label: "status:", hint: "HTTP status code" },
  { label: "method:", hint: "HTTP method" },
  { label: "route:", hint: "Request route" },
  { label: "endpoint:", hint: "Endpoint path" },
  { label: "errorType:", hint: "Error type" },
  { label: "environment:", hint: "Deploy environment" },
  { label: "source:", hint: "Log source" },
  { label: "responseTime:", hint: "Response time (ms)" },
  { label: "traceId:", hint: "Trace ID" },
  { label: "requestId:", hint: "Request ID" },
  { label: "deploymentId:", hint: "Deployment ID" },
];

const FILTER_SUGGESTIONS = {
  "level:": ["level:INFO", "level:WARN", "level:ERROR", "level:DEBUG"],
  "status:": [
    "status:200", "status:201", "status:204",
    "status:400", "status:401", "status:403", "status:404",
    "status:500", "status:502", "status:503",
  ],
  "method:": [
    "method:GET", "method:POST", "method:PUT",
    "method:DELETE", "method:PATCH", "method:OPTIONS",
  ],
  "errorType:": [
    "errorType:NONE", "errorType:TypeError", "errorType:ReferenceError",
    "errorType:SyntaxError", "errorType:NetworkError", "errorType:TimeoutError",
  ],
  "environment:": [
    "environment:production", "environment:staging",
    "environment:development", "environment:test",
  ],
  "service:": [],
  "module:": [],
  "route:": [],
  "endpoint:": [],
  "source:": [],
  "responseTime:": [],
  "traceId:": [],
  "requestId:": [],
  "deploymentId:": [],
};

const RECENT_KEY = "logbox_recent_searches";
const MAX_RECENT = 8;

function getRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecentSearch(query) {
  if (!query.trim()) return;
  const prev = getRecentSearches().filter((s) => s !== query);
  const next = [query, ...prev].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function getActivePrefix(query) {
  const token = query.split(" ").pop().toLowerCase();
  return FILTER_CHIPS.find((chip) => token.startsWith(chip.label.toLowerCase())) ?? null;
}

function LogToolbar({
  searchQuery,
  onSearchChange,
  isLive,
  onToggleLive,
  viewMode,
  onToggleGrouped,
  onRefresh,
  onExport,
  loading,
  sidebarOpen,
  onToggleSidebar,
}) {
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [recents, setRecents] = useState([]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!showPanel) return undefined;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setShowPanel(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPanel]);

  const handleFocus = () => {
    setFocused(true);
    setRecents(getRecentSearches());
    setShowPanel(true);
  };

  const handleBlur = () => {
    setFocused(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      saveRecentSearch(searchQuery.trim());
      setRecents(getRecentSearches());
      setShowPanel(false);
    }
    if (e.key === "Escape") {
      setShowPanel(false);
      inputRef.current?.blur();
    }
  };

  const applyChip = useCallback((chip) => {
    const prefix = chip.label;
    const base = searchQuery.endsWith(" ") || searchQuery === "" ? searchQuery : `${searchQuery} `;
    onSearchChange(base + prefix);
    inputRef.current?.focus();
  }, [searchQuery, onSearchChange]);

  const applySuggestion = useCallback((suggestion) => {
    const parts = searchQuery.split(" ");
    parts[parts.length - 1] = suggestion;
    const newVal = `${parts.join(" ")} `;
    onSearchChange(newVal);
    saveRecentSearch(newVal.trim());
    setRecents(getRecentSearches());
    setShowPanel(false);
    inputRef.current?.focus();
  }, [searchQuery, onSearchChange]);

  const applyRecent = useCallback((val) => {
    onSearchChange(val);
    saveRecentSearch(val);
    setShowPanel(false);
  }, [onSearchChange]);

  const handleClear = () => {
    onSearchChange("");
    inputRef.current?.focus();
  };

  const activePrefix = getActivePrefix(searchQuery);
  const suggestions = activePrefix ? (FILTER_SUGGESTIONS[activePrefix.label] ?? []) : [];
  const showSuggestions = activePrefix !== null;

  const filteredRecents = searchQuery
    ? recents.filter((r) => r.toLowerCase().includes(searchQuery.toLowerCase()) && r !== searchQuery)
    : recents;

  const hasContent = filteredRecents.length > 0 || suggestions.length > 0 || (!showSuggestions && FILTER_CHIPS.length > 0);

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        {!sidebarOpen && (
          <button className="toolbar-icon-btn" onClick={onToggleSidebar} title="Open filters">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
              <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
              <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>
              <line x1="17" y1="16" x2="23" y2="16"/>
            </svg>
          </button>
        )}
      </div>

      <div className="toolbar-search-wrap" ref={panelRef}>
        <div className={`toolbar-search ${focused ? "focused" : ""}`}>
          <svg className="toolbar-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            className="toolbar-search-input"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.target.value);
              setRecents(getRecentSearches());
              setShowPanel(true);
            }}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />
          {searchQuery && (
            <button className="toolbar-search-clear" onMouseDown={handleClear}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>

        {showPanel && hasContent && (
          <div className="search-panel">
            {!showSuggestions && filteredRecents.length > 0 && (
              <div className="search-panel-section">
                <span className="search-panel-label">Recent searches</span>
                <div className="search-panel-chips">
                  {filteredRecents.map((r) => (
                    <button key={r} className="search-chip recent" onMouseDown={() => applyRecent(r)}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showSuggestions && suggestions.length > 0 && (
              <div className="search-panel-section">
                <span className="search-panel-label">Suggestions</span>
                <div className="search-panel-chips vertical">
                  {suggestions.map((s) => (
                    <button key={s} className="search-chip suggestion" onMouseDown={() => applySuggestion(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!showSuggestions && (
              <div className="search-panel-section">
                <span className="search-panel-label">Filter by field</span>
                <div className="search-panel-chips">
                  {FILTER_CHIPS.map((chip) => (
                    <button
                      key={chip.label}
                      className="search-chip filter"
                      title={chip.hint}
                      onMouseDown={() => applyChip(chip)}
                    >
                      <span className="chip-label">{chip.label}</span>
                      <span className="chip-hint">{chip.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="toolbar-right">
        <button className={`toolbar-live ${isLive ? "on" : ""}`} onClick={onToggleLive}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/>
            {isLive && <circle cx="6" cy="6" r="2" fill="currentColor"/>}
          </svg>
          <span>Live</span>
        </button>

        <button
          className={`toolbar-live ${viewMode === "grouped" ? "on" : ""}`}
          onClick={onToggleGrouped}
          title="Toggle grouped incidents"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2.25" y="2.25" width="4.5" height="4.5" rx="1" />
            <rect x="9.25" y="2.25" width="4.5" height="4.5" rx="1" />
            <rect x="2.25" y="9.25" width="4.5" height="4.5" rx="1" />
            <rect x="9.25" y="9.25" width="4.5" height="4.5" rx="1" />
          </svg>
          <span>Group Logs</span>
        </button>

        <button className={`toolbar-icon-btn ${loading ? "spin" : ""}`} onClick={onRefresh} title="Refresh">
          <svg className="toolbar-refresh-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>

        <button className="toolbar-icon-btn" onClick={onExport} title="Export">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

export default LogToolbar;
