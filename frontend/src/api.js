const API_BASE = import.meta.env.VITE_API_URL || "";

async function handleResponse(res) {
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text || "Unknown error" };
  }
  if (!res.ok) {
    const message = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  submitEvaluation: async (data) => {
    const res = await fetch(`${API_BASE}/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  submitDemo: async (overrides = {}) => {
    const res = await fetch(`${API_BASE}/api/evaluate/demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(overrides),
    });
    return handleResponse(res);
  },

  getStatus: async (evalId) => {
    const res = await fetch(`${API_BASE}/api/evaluate/${evalId}/status`);
    return handleResponse(res);
  },

  getResult: async (evalId) => {
    const res = await fetch(`${API_BASE}/api/evaluate/${evalId}`);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: text }; }
    return { status: res.status, data };
  },

  listEvaluations: async () => {
    const res = await fetch(`${API_BASE}/api/evaluations`);
    return handleResponse(res);
  },

  getFrameworks: async () => {
    const res = await fetch(`${API_BASE}/api/frameworks`);
    return handleResponse(res);
  },

  healthCheck: async () => {
    const res = await fetch(`${API_BASE}/api/health`);
    return handleResponse(res);
  },

  uploadGovernanceDoc: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/governance/upload`, {
      method: "POST",
      body: formData,
    });
    return handleResponse(res);
  },

  confirmGovernanceDimensions: async (yaml, filename) => {
    const res = await fetch(`${API_BASE}/api/governance/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaml, filename }),
    });
    return handleResponse(res);
  },
};
