/**
 * Frontend API client — Hono バックエンドへの fetch ラッパー。
 * 認証は localStorage の access_token を Authorization ヘッダで付与。
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const TOKEN_KEY = 'companybrain_access_token';

export function getAccessToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setAccessToken(token) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getAccessToken();
  const headers = {
    ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body && !(options.body instanceof FormData) && typeof options.body !== 'string'
      ? JSON.stringify(options.body)
      : options.body,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_e) { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(json?.message || json?.error || `API error ${res.status}`);
    err.status = res.status;
    err.errorType = json?.errorType;
    err.detail = json?.detail;
    throw err;
  }
  return json;
}

export const api = {
  // 認証
  register: ({ email, password, displayName }) =>
    request('/auth/register', { method: 'POST', body: { email, password, displayName } }),
  login: ({ email, password }) =>
    request('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/auth/me'),

  // Brain Persons
  listBrainPersons: () => request('/brain-persons'),
  getBrainPerson: (id) => request(`/brain-persons/${id}`),
  createBrainPerson: (body) => request('/brain-persons', { method: 'POST', body }),
  updateBrainPerson: (id, body) => request(`/brain-persons/${id}`, { method: 'PATCH', body }),

  // Brain Source Assets
  listBrainAssets: (brainPersonId) =>
    request(`/brain-assets?brainPersonId=${encodeURIComponent(brainPersonId)}`),
  uploadBrainAsset: ({ brainPersonId, assetType, file }) => {
    const form = new FormData();
    form.set('brainPersonId', brainPersonId);
    form.set('assetType', assetType);
    form.set('file', file);
    return request('/brain-assets', { method: 'POST', body: form });
  },
  getAssetSignedUrl: (assetId) => request(`/brain-assets/${assetId}/signed-url`),

  // Chat
  chat: ({ brainPersonId, message }) =>
    request('/chat', { method: 'POST', body: { brainPersonId, message } }),

  // Brain Interviews
  listInterviews: (brainPersonId) =>
    request(`/brain-interviews?brainPersonId=${encodeURIComponent(brainPersonId)}`),
  getInterview: (id) => request(`/brain-interviews/${id}`),
  startInterview: ({ brainPersonId, useCaseType, title }) =>
    request('/brain-interviews', { method: 'POST', body: { brainPersonId, useCaseType, title } }),
  sendInterviewTurn: (id, userMessage) =>
    request(`/brain-interviews/${id}/turn`, { method: 'POST', body: { userMessage } }),
  completeInterview: (id) =>
    request(`/brain-interviews/${id}/complete`, { method: 'POST', body: {} }),

  // Brain Policies
  listPolicyCandidates: (brainPersonId, status) =>
    request(`/brain-policies?brainPersonId=${encodeURIComponent(brainPersonId)}${status ? `&status=${status}` : ''}`),
  decidePolicy: (id, { decision, reviewerNote, audienceScope }) =>
    request(`/brain-policies/${id}/decision`, { method: 'POST', body: { decision, reviewerNote, audienceScope } }),

  // HeyGen Live Avatar
  heygenStatus: () => request('/heygen/status'),
  heygenSessionToken: () => request('/heygen/session-token', { method: 'POST', body: {} }),
  heygenAvatars: () => request('/heygen/avatars'),
  heygenVoices: () => request('/heygen/voices'),
};
