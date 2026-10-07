import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { THEME_STORAGE_KEY, getTheme } from '../config/themes';

const ThemeContext = createContext(null);

const getInitialTheme = () => {
  if (typeof window === 'undefined') return 'default';
  return window.localStorage.getItem(THEME_STORAGE_KEY) || 'default';
};

export const ThemeProvider = ({ children }) => {
  const [themeId, setThemeId] = useState(getInitialTheme);

  useEffect(() => {
    const theme = getTheme(themeId);
    const root = document.documentElement;
    root.dataset.theme = theme.id;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme.id);
  }, [themeId]);

  const value = useMemo(() => ({
    themeId,
    theme: getTheme(themeId),
    setTheme: setThemeId
  }), [themeId]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return value;
};
