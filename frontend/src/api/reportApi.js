const AUTH_API = process.env.REACT_APP_AUTH_API_URL || 'http://localhost:8002';

export async function saveReport({ module, child_name, child_age, result_json, token }) {
  const effectiveToken = token || localStorage.getItem('neurosage_token');
  if (!effectiveToken) throw new Error('Not authenticated');
  const res = await fetch(`${AUTH_API}/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${effectiveToken}`,
    },
    body: JSON.stringify({ module, child_name, child_age, result_json }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

export async function fetchReports(token) {
  if (!token) return [];
  try {
    const res = await fetch(`${AUTH_API}/reports`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data.reports || [];
  } catch (e) {
    console.error('fetchReports failed:', e);
    return [];
  }
}
