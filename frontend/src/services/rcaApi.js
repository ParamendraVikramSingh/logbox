const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || "http://localhost:4000";
const RCA_BASE_URL = `${API_ORIGIN}${import.meta.env.VITE_RCA_API_BASE_PATH || "/rca"}`;

async function request(path, params = {}) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, value);
    }
  });

  const response = await fetch(`${RCA_BASE_URL}${path}?${search.toString()}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || payload?.message || "Request failed");
  }

  return payload;
}

export function getGroupedIncidents(params) {
  return request("/incidents", params);
}

export function analyzeIncident(params) {
  return request("/analyze", params);
}
