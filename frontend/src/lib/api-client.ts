/**
 * API Client - Axios-based HTTP client for CTX Quiz API
 * 
 * Provides a configured axios instance with:
 * - Base URL configuration
 * - Request/response interceptors
 * - Error handling
 * - Type-safe API methods
 * 
 * Requirements: 14.1, 14.2
 */

import axios, {
  AxiosInstance,
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';

/**
 * API Error response structure
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp?: string;
  requestId?: string;
}

/**
 * API Response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}


/**
 * Get the API base URL from environment or default
 */
function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Client-side: use environment variable or default
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  }
  // Server-side: use internal URL if available
  return process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
}

/**
 * Create and configure the axios instance
 */
function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: getBaseUrl(),
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor - add auth token if available
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      // Get token from localStorage if available
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('quiz_session_token');
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
      return config;
    },
    (error: AxiosError) => {
      console.error('[API Client] Request error:', error.message);
      return Promise.reject(error);
    }
  );

  // Response interceptor - handle errors
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError<ApiError>) => {
      const apiError = handleApiError(error);
      return Promise.reject(apiError);
    }
  );

  return client;
}

/**
 * Handle API errors and transform to consistent format
 */
function handleApiError(error: AxiosError<ApiError>): ApiError {
  if (error.response) {
    // Server responded with error
    const data = error.response.data;
    return {
      code: data?.code || `HTTP_${error.response.status}`,
      message: data?.message || getDefaultErrorMessage(error.response.status),
      details: data?.details,
      timestamp: data?.timestamp || new Date().toISOString(),
      requestId: data?.requestId,
    };
  } else if (error.request) {
    // Request made but no response
    return {
      code: 'NETWORK_ERROR',
      message: 'Unable to connect to the server. Please check your internet connection.',
      timestamp: new Date().toISOString(),
    };
  } else {
    // Error setting up request
    return {
      code: 'REQUEST_ERROR',
      message: error.message || 'An unexpected error occurred.',
      timestamp: new Date().toISOString(),
    };
  }
}


/**
 * Get default error message for HTTP status codes
 */
function getDefaultErrorMessage(status: number): string {
  const messages: Record<number, string> = {
    400: 'Invalid request. Please check your input.',
    401: 'You are not authorized. Please log in again.',
    403: 'You do not have permission to perform this action.',
    404: 'The requested resource was not found.',
    409: 'A conflict occurred. Please try again.',
    422: 'The provided data is invalid.',
    429: 'Too many requests. Please wait a moment.',
    500: 'An internal server error occurred.',
    502: 'The server is temporarily unavailable.',
    503: 'The service is temporarily unavailable.',
  };
  return messages[status] || 'An unexpected error occurred.';
}

// Create the singleton instance
const apiClient = createApiClient();

/**
 * Type-safe GET request
 */
export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.get<T>(url, config);
  return response.data;
}

/**
 * Type-safe POST request
 */
export async function post<T, D = unknown>(
  url: string,
  data?: D,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await apiClient.post<T>(url, data, config);
  return response.data;
}

/**
 * Type-safe PUT request
 */
export async function put<T, D = unknown>(
  url: string,
  data?: D,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await apiClient.put<T>(url, data, config);
  return response.data;
}

/**
 * Type-safe PATCH request
 */
export async function patch<T, D = unknown>(
  url: string,
  data?: D,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await apiClient.patch<T>(url, data, config);
  return response.data;
}

/**
 * Type-safe DELETE request
 */
export async function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.delete<T>(url, config);
  return response.data;
}

/**
 * Upload file with multipart/form-data
 */
export async function uploadFile<T>(
  url: string,
  file: File,
  fieldName: string = 'file',
  additionalData?: Record<string, string>
): Promise<T> {
  const formData = new FormData();
  formData.append(fieldName, file);
  
  if (additionalData) {
    Object.entries(additionalData).forEach(([key, value]) => {
      formData.append(key, value);
    });
  }

  const response = await apiClient.post<T>(url, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
}

// Export the axios instance for advanced use cases
export { apiClient };

// Export default object with all methods
export default {
  get,
  post,
  put,
  patch,
  delete: del,
  uploadFile,
  client: apiClient,
};
