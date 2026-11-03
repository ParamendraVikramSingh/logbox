import "../styles/dropdown.css";

function LogDurationFilter({ duration, setDuration }) {
  const options = [
    { label: "All Time", value: "ALL" },
    { label: "Last 15 min", value: "15m" },
    { label: "Last 30 min", value: "30m" },
    { label: "Last 1 hour", value: "1h" },
    { label: "Last 6 hours", value: "6h" },
    { label: "Last 12 hours", value: "12h" },
    { label: "Last 1 day", value: "1d" },
    { label: "Last 3 days", value: "3d" },
  ];

  return (
    <div className="duration-filter">
      <select
        className="duration-select"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default LogDurationFilter;