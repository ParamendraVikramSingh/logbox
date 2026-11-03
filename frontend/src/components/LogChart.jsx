import { useEffect, useState } from "react";
import "../styles/LogChart.css";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

const LEVELS = [
  { key: "INFO",  color: "#4dabf7", activeColor: "#339af0" },
  { key: "WARN",  color: "#f59f00", activeColor: "#f08c00" },
  { key: "ERROR", color: "#fa5252", activeColor: "#e03131" },
  { key: "DEBUG", color: "#a855f7", activeColor: "#9333ea" },
];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  // Only show levels that have a non-zero value
  const nonEmpty = payload.filter((p) => p.value > 0);
  if (!nonEmpty.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      {nonEmpty.map(({ name, value }) => {
        const level = LEVELS.find((l) => l.key === name);
        return (
          <p key={name} className="chart-tooltip-row">
            <span className="chart-tooltip-dot" style={{ background: level?.color }} />
            <span style={{ color: level?.color }}>{name}</span>
            <strong>{value}</strong>
          </p>
        );
      })}
    </div>
  );
}

function LogChart({ startTime, version = 0 }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    const params = new URLSearchParams();
    if (startTime) params.set("start", startTime);

    fetch(`http://localhost:4000/logs/stats?${params}`)
      .then((res) => res.json())
      .then((stats) => {
        // stats = [{ _id: { minute, level }, count }, ...]
        // Pivot into { label, INFO, WARN, ERROR, DEBUG } per minute bucket
        const buckets = {};

        stats.forEach(({ _id, count }) => {
          const { minute, level } = _id;
          if (!buckets[minute]) {
            // Bucket string from MongoDB is UTC — append Z so Date() doesn't
            // misread it as local time, then toLocaleString converts to IST
            const d = new Date(minute.replace(" ", "T") + ":00Z");
            const label = d.toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            buckets[minute] = { minute, label, INFO: 0, WARN: 0, ERROR: 0, DEBUG: 0 };
          }
          if (level in buckets[minute]) {
            buckets[minute][level] = count;
          }
        });

        const sorted = Object.values(buckets).sort((a, b) =>
          a.minute.localeCompare(b.minute)
        );

        setData(sorted);
      })
      .catch((err) => console.error("Stats fetch failed:", err))
      .finally(() => setLoading(false));
  }, [startTime, version]);


  return (
    <div className="chart">
      <div className="chart-header">
        <h3>Logs over Time</h3>
        {loading && <span className="chart-loading">Updating…</span>}
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={data}
            margin={{ top: 4, right: 8, left: -10, bottom: 4 }}
            barCategoryGap="30%"
            barGap={2}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.05)"
              vertical={false}
            />

            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#9399ab" }}
            />

            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#9399ab" }}
              allowDecimals={false}
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
            />

            {/* No stackId — each level is its own side-by-side bar */}
            {LEVELS.map(({ key, color, activeColor }) => (
              <Bar
                key={key}
                dataKey={key}
                fill={color}
                radius={[3, 3, 0, 0]}
                activeBar={{ fill: activeColor }}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="chart-legend">
        {LEVELS.map(({ key, color }) => (
          <span key={key} className="chart-legend-item">
            <span className="chart-legend-dot" style={{ background: color }} />
            {key}
          </span>
        ))}
      </div>
    </div>
  );
}

export default LogChart;
