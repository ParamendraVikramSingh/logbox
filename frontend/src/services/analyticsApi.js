const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || "http://localhost:4000";

async function fetchAnalytics(startTime) {
  const search = new URLSearchParams();
  if (startTime) {
    search.set("start", startTime);
  }

  const response = await fetch(`${API_ORIGIN}/logs/analytics?${search.toString()}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || "Failed to load analytics");
  }

  return payload;
}

export { fetchAnalytics };
