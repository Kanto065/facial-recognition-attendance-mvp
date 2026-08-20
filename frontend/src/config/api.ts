/**
 * API Configuration
 * Base URL comes from the environment (VITE_API_BASE_URL) so the same build
 * can point at local/staging/production backends without a code change.
 */

export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
} as const;

export const API_BASE_URL = API_CONFIG.BASE_URL;
