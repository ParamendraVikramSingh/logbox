import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchAnalytics } from "../services/analyticsApi";
import "../styles/AnalyticsOverview.css";

const ROUTE_COLORS = ["#7dd3fc", "#a78bfa", "#f59e0b", "#fb7185", "#4ade80", "#facc15"];

function formatMetricValue(value) {
  const numeric = Number(value || 0);
  if (numeric >= 1000) {
    return numeric.toLocaleString();
  }
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

function Sparkline({ points, positive }) {
  const width = 220;
  const height = 56;
  const values = points.map((point) => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);

  const line = points.map((point, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * width;
    const y = height - ((point.value - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  }).join(" ");

  const area = `0,${height} ${line} ${width},${height}`;
  const lineColor = positive ? "var(--metric-positive)" : "var(--metric-negative)";
  const fillColor = positive ? "rgba(74, 222, 128, 0.18)" : "rgba(244, 63, 94, 0.18)";

  return (
    <svg className="analytics-sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`M ${area.replace(/ /g, " L ")}`} fill={fillColor} />
      <polyline points={line} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function AnalyticsTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  return (
    <div className="analytics-tooltip">
      <div className="analytics-tooltip-label">{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="analytics-tooltip-row">
          <span className="analytics-tooltip-dot" style={{ background: entry.color }} />
          <span>{entry.dataKey}</span>
          <strong>{formatMetricValue(entry.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function AnalyticsOverview({
  startTime,
  version = 0,
  sidebarOpen,
  onOpenSidebar,
  analyticsDuration,
  onAnalyticsDurationChange,
  analyticsDurationOptions,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const payload = await fetchAnalytics(startTime);
        if (!cancelled) {
          setData(payload);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError.message || "Failed to load analytics");
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [startTime, version]);

  const routeKeys = useMemo(() => data?.routeKeys || [], [data]);
  const chartColors = useMemo(() => routeKeys.reduce((accumulator, key, index) => {
    accumulator[key] = ROUTE_COLORS[index % ROUTE_COLORS.length];
    return accumulator;
  }, {}), [routeKeys]);

  if (loading && !data) {
    return <div className="analytics-empty-card">Loading analytics...</div>;
  }

  if (error) {
    return <div className="analytics-empty-card error">{error}</div>;
  }

  if (!data) {
    return <div className="analytics-empty-card">No analytics available yet.</div>;
  }

  const gaugeAngle = Math.min((data.overallErrorPercentage / 10) * 270, 270);

  return (
    <section className="analytics-board">
      <div className="analytics-board-topbar">
        <div>
          <span className="analytics-kicker">Tracing</span>
          <h1>Endpoint RED overview</h1>
          <p>
            Request rate, error percentage, and latency snapshots across the busiest targets in the
            current time window.
          </p>
        </div>
        <div className="analytics-topbar-actions">
          <label className="analytics-range-field">
            <span>Time Window</span>
            <select value={analyticsDuration} onChange={(event) => onAnalyticsDurationChange(event.target.value)}>
              {analyticsDurationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="analytics-time-pill">{data.rangeLabel}</div>
        </div>
      </div>

      <div className="analytics-layout-grid">
        <div className="analytics-main-column">
          <section className="analytics-panel analytics-panel-chart analytics-panel-tight">
            <div className="analytics-panel-head">
              <h2>Request Rate</h2>
              <span>{formatMetricValue(data.totalRequests)} total requests</span>
            </div>
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={data.requestRateSeries} margin={{ top: 16, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical />
                <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<AnalyticsTooltip />} />
                {routeKeys.map((key) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stackId="requests"
                    stroke={chartColors[key]}
                    fill={chartColors[key]}
                    fillOpacity={0.28}
                    strokeWidth={1.8}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
            <div className="analytics-legend">
              {routeKeys.map((key) => (
                <span key={key} className="analytics-legend-item">
                  <span className="analytics-legend-swatch" style={{ background: chartColors[key] }} />
                  {key}
                </span>
              ))}
            </div>
          </section>

          <section className="analytics-panel analytics-table-panel analytics-panel-tight">
            <div className="analytics-panel-head center">
              <h2>Top 10 Highest Endpoint Latencies</h2>
              <span>{data.rangeLabel}</span>
            </div>
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>HTTP Method</th>
                  <th>Endpoint</th>
                  <th>Latency (ms)</th>
                </tr>
              </thead>
              <tbody>
                {data.topLatencies.map((entry, index) => (
                  <tr key={`${entry.endpoint}-${entry.method}-${index}`}>
                    <td>{entry.method}</td>
                    <td>{entry.endpoint}</td>
                    <td>{formatMetricValue(entry.latency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="analytics-panel analytics-panel-chart analytics-panel-tight">
            <div className="analytics-panel-head center">
              <h2>All Endpoint Latencies in ms</h2>
              <span>{data.rangeLabel}</span>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data.latencySeries} margin={{ top: 16, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical />
                <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<AnalyticsTooltip />} />
                {routeKeys.map((key) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stackId="latency"
                    stroke={chartColors[key]}
                    fill={chartColors[key]}
                    fillOpacity={0.2}
                    strokeWidth={1.4}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </section>
        </div>

        <aside className="analytics-side-column">
          <section className="analytics-panel analytics-gauge-panel">
            <div className="analytics-panel-head center">
              <h2>Overall Error %age</h2>
            </div>
            <div
              className="analytics-gauge"
              style={{ background: `conic-gradient(var(--metric-positive) ${gaugeAngle}deg, var(--hero-surface) ${gaugeAngle}deg 360deg)` }}
            >
              <div className="analytics-gauge-inner">
                <strong>{data.overallErrorPercentage.toFixed(2)}</strong>
                <span>Error Rate</span>
              </div>
            </div>
          </section>

          <section className="analytics-panel analytics-target-panel">
            <div className="analytics-panel-head center">
              <h2>Error Percentages by Target</h2>
            </div>
            <div className="analytics-target-grid">
              {data.routeStats.map((route) => (
                <div key={route.route} className="analytics-target-card">
                  <span className="analytics-target-name">{route.route}</span>
                  <strong className={route.errorPercentage >= 5 ? "negative" : "positive"}>
                    {Number(route.errorPercentage).toFixed(2)}
                  </strong>
                  <Sparkline points={route.sparkline} positive={route.errorPercentage < 5} />
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

export default AnalyticsOverview;
