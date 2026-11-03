import { useEffect, useState } from "react";
import "../styles/ErrorRateCards.css";

const SOCKET_URL = "http://localhost:4000";

function ErrorRateCards({ startTime, version = 0 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    const params = new URLSearchParams();
    if (startTime) params.set("start", startTime);

    fetch(`${SOCKET_URL}/logs/error-rate?${params}`)
      .then((res) => res.json())
      .then((stats) => {
        setData(stats);
      })
      .catch((err) => console.error("Error rate fetch failed:", err))
      .finally(() => setLoading(false));
  }, [startTime, version]);

  if (loading && !data) {
    return <div className="error-rate-container loading">Calculating error statistics...</div>;
  }

  if (!data || data.globalTotalLogs === 0) return null;

  return (
    <div className="error-rate-container">
      <div className="error-rate-global card">
        <h4>Global Error Rate</h4>
        <div className="rate-value">
          {data.globalErrorRate.toFixed(2)}%
        </div>
        <div className="rate-subtext">
          {data.globalErrorLogs} / {data.globalTotalLogs} logs
        </div>
      </div>

      <div className="error-rate-services">
        {data.services.map(svc => (
          <div key={svc.service} className="error-rate-service card">
            <h5>{svc.service}</h5>
            <div className={`rate-value ${svc.errorRate > 5 ? 'high' : svc.errorRate > 1 ? 'medium' : 'low'}`}>
              {svc.errorRate.toFixed(2)}%
            </div>
            <div className="rate-subtext">
              {svc.errorLogs} errors
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ErrorRateCards;
