/**
 * Custom hook for API calls with error handling and loading states
 * Provides consistent error handling and loading UX across the app
 */
import { useState, useCallback } from 'react';

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export interface ApiOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: string) => void;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
}

/**
 * Hook for making API calls with automatic error handling and loading states
 *
 * @example
 * ```tsx
 * const { data, error, loading, execute } = useApi<User>('/api/user');
 *
 * useEffect(() => {
 *   execute();
 * }, []);
 *
 * if (loading) return <Loading />;
 * if (error) return <Alert variant="destructive">{error}</Alert>;
 * return <div>{data?.name}</div>;
 * ```
 */
export function useApi<T = any>(url: string, options: ApiOptions = {}) {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    error: null,
    loading: false,
  });

  const execute = useCallback(
    async (body?: any) => {
      setState({ data: null, error: null, loading: true });

      try {
        const response = await fetch(url, {
          method: options.method || 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage =
            errorData.error ||
            errorData.message ||
            `Request failed with status ${response.status}`;

          throw new Error(errorMessage);
        }

        const data = await response.json();

        setState({ data, error: null, loading: false });

        if (options.onSuccess) {
          options.onSuccess(data);
        }

        return data;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('An unexpected error occurred');
        const errorMessage = error.message;

        setState({ data: null, error: errorMessage, loading: false });

        if (options.onError) {
          options.onError(errorMessage);
        }

        throw error;
      }
    },
    [url, options]
  );

  const reset = useCallback(() => {
    setState({ data: null, error: null, loading: false });
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}

/**
 * Hook for form submissions with error handling
 *
 * @example
 * ```tsx
 * const { loading, error, submit } = useFormSubmit('/api/auth/login');
 *
 * const handleSubmit = async (e) => {
 *   e.preventDefault();
 *   await submit({ email, password });
 * };
 * ```
 */
export function useFormSubmit(url: string, options: ApiOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = useCallback(
    async (data: any) => {
      setLoading(true);
      setError(null);
      setSuccess(false);

      try {
        const response = await fetch(url, {
          method: options.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage =
            errorData.error ||
            errorData.message ||
            `Request failed with status ${response.status}`;

          throw new Error(errorMessage);
        }

        const result = await response.json();

        setSuccess(true);
        setLoading(false);

        if (options.onSuccess) {
          options.onSuccess(result);
        }

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Form submission failed');
        const errorMessage = error.message;

        setError(errorMessage);
        setLoading(false);

        if (options.onError) {
          options.onError(errorMessage);
        }

        throw error;
      }
    },
    [url, options]
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setSuccess(false);
  }, []);

  return {
    loading,
    error,
    success,
    submit,
    reset,
  };
}
