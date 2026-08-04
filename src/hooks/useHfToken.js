import { useEffect, useState } from 'react';

const STORAGE_KEY = 'cycle.hfToken';

export function useHfToken() {
  const [token, setTokenState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try {
      if (token) localStorage.setItem(STORAGE_KEY, token);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [token]);

  return [token, setTokenState];
}
