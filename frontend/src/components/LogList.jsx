import "../styles/LogList.css";

// Convert UTC ISO string → browser local time
function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function LogList({ logs, filter }) {
  const filteredLogs =
    filter === "ALL" ? logs : logs.filter((l) => l.level === filter);

  if (filteredLogs.length === 0) {
    return (
      <div className="log-list">
        <div className="log-empty">No logs to display.</div>
      </div>
    );
  }

  return (
    <div className="log-list">
      {filteredLogs.map((log, index) => (
        <div key={index} className={`log-item ${log.level}`}>
          <div className="log-item-message">
            <span className="log-item-level">{log.level}</span>
            <span className="log-item-text">{log.message}</span>
          </div>
          <span className="log-item-time">{formatTime(log.timestamp)}</span>
        </div>
      ))}
    </div>
  );
}

export default LogList;