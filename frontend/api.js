import Constants from 'expo-constants';
import { Platform } from 'react-native';

function resolveApiBaseUrl() {
  const configuredUrl = Constants.expoConfig?.extra?.apiBaseUrl;
  if (configuredUrl) return configuredUrl.replace(/\/$/, '');

  const hostUri = Constants.expoConfig?.hostUri;
  const developmentHost = hostUri?.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  if (developmentHost) return `http://${developmentHost}:8000`;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `http://${window.location.hostname}:8000`;
  }
  if (Platform.OS === 'android') return 'http://10.0.2.2:8000';
  return 'http://127.0.0.1:8000';
}

export const API_BASE_URL = resolveApiBaseUrl();

function formatApiError(payload, response) {
  const detail = payload?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((issue) => issue.msg || 'Invalid request').join('. ');
  return `Request failed (${response.status})`;
}

export async function apiRequest(path, { method = 'GET', token, body, form } = {}) {
  const headers = { Accept: 'application/json' };
  let requestBody;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  } else if (form !== undefined) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    requestBody = Object.entries(form)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { method, headers, body: requestBody });
  } catch {
    const error = new Error(`Could not reach the API at ${API_BASE_URL}. Start the backend on port 8000 and connect this phone to the same Wi-Fi network.`);
    error.networkError = true;
    throw error;
  }

  const responseText = await response.text();
  let payload = null;
  if (responseText) {
    try { payload = JSON.parse(responseText); } catch { payload = { detail: responseText }; }
  }
  if (!response.ok) {
    const error = new Error(formatApiError(payload, response));
    error.status = response.status;
    throw error;
  }
  return payload;
}
