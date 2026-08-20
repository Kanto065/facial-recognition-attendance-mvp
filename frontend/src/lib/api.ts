import { API_BASE_URL } from '@/config/api';

interface ApiResponse<T = any> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
}

export class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// Validation error responses (from FastAPI, see app/envelope.py) look like:
// { success: false, ..., errors: { fieldName: ["message", ...] } }
// This turns the field->messages map into a plain-English summary for toasts.
function humanizeFieldName(path: string): string {
  const key = path.replace(/^\$\.?/, '').split('.').pop() || path;
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function friendlyValidationMessage(field: string, message: string): string | null {
  if (/JSON value could not be converted/i.test(message)) {
    return `${humanizeFieldName(field)} has an invalid value.`;
  }
  if (field === 'request' && /required/i.test(message)) {
    // Only shown when nothing more specific was extracted - the whole body failed to parse.
    return null;
  }
  return message;
}

function extractErrorMessage(data: any, fallback: string): string {
  const errors = data?.errors;
  if (errors && typeof errors === 'object') {
    const messages = new Set<string>();
    for (const [field, fieldMessages] of Object.entries(errors)) {
      const list = Array.isArray(fieldMessages) ? fieldMessages : [String(fieldMessages)];
      for (const raw of list) {
        const friendly = friendlyValidationMessage(field, String(raw));
        if (friendly) messages.add(friendly);
      }
    }
    if (messages.size > 0) return Array.from(messages).join(' ');
    return 'Please check the highlighted fields and try again.';
  }
  return data?.message || data?.title || fallback;
}

// Access tokens expire after 30 minutes (see JwtOptions.AccessTokenMinutes) - this dedupes
// concurrent 401s into a single /api/auth/refresh call and retries them once the new access
// token lands. If refresh itself fails, tokens are cleared so AuthContext bounces to /login.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('admin_refresh_token');
  if (!refreshToken) return null;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        const data = await response.json();
        if (!response.ok || !data?.success || !data?.data) return null;

        localStorage.setItem('admin_token', data.data.accessToken);
        localStorage.setItem('admin_refresh_token', data.data.refreshToken);
        return data.data.accessToken as string;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

async function request<T = any>(
  endpoint: string,
  options: RequestInit = {},
  isRetry = false
): Promise<ApiResponse<T>> {
  const token = localStorage.getItem('admin_token');

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401 && !isRetry && localStorage.getItem('admin_refresh_token')) {
      const newAccessToken = await refreshAccessToken();
      if (newAccessToken) return request<T>(endpoint, options, true);
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_refresh_token');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(response.status, extractErrorMessage(data, 'Request failed'));
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, 'Failed to connect to server');
  }
}

export const api = {
  get<T = any>(endpoint: string): Promise<ApiResponse<T>> {
    return request<T>(endpoint, { method: 'GET' });
  },

  post<T = any>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  put<T = any>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  patch<T = any>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  delete<T = any>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return request<T>(endpoint, {
      method: 'DELETE',
      ...(body && { body: JSON.stringify(body) }),
    });
  },

  async upload<T = any>(endpoint: string, formData: FormData, isRetry = false): Promise<ApiResponse<T>> {
    const token = localStorage.getItem('admin_token');
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      // No Content-Type header here - the browser sets multipart/form-data with the
      // correct boundary itself; setting it manually breaks the upload.
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (response.status === 401 && !isRetry && localStorage.getItem('admin_refresh_token')) {
        const newAccessToken = await refreshAccessToken();
        if (newAccessToken) return api.upload<T>(endpoint, formData, true);
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_refresh_token');
      }

      const data = await response.json();
      if (!response.ok) {
        throw new ApiError(response.status, extractErrorMessage(data, 'Upload failed'));
      }
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to connect to server');
    }
  },
};

