import { useEffect, useState } from 'react';

const KEY = 'cycle.hfToken';

export function useHfToken() {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(KEY) || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try {
      if (token) localStorage.setItem(KEY, token);
      else localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, [token]);

  return [token, setToken];
}
