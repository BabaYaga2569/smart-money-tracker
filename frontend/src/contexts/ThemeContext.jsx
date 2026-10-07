import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { THEME_STORAGE_KEY, getTheme } from '../config/themes';

const ThemeContext = createContext(null);

const getInitialTheme = () => {
  if (typeof window === 'undefined') return 'default';
  return window.localStorage.getItem(THEME_STORAGE_KEY) || 'default';
};

export const ThemeProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [themeId, setThemeId] = useState(getInitialTheme);

  useEffect(() => {
    const theme = getTheme(themeId);
    document.documentElement.dataset.theme = theme.id;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme.id);
  }, [themeId]);

  useEffect(() => {
    let active = true;

    const hydrateThemeFromAccount = async () => {
      if (!currentUser?.uid) return;

      try {
        const settingsRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
        const snapshot = await getDoc(settingsRef);
        const savedThemeId = snapshot.exists() ? snapshot.data()?.themeId : null;

        if (active && savedThemeId && getTheme(savedThemeId).id === savedThemeId) {
          setThemeId(savedThemeId);
        }
      } catch (error) {
        console.warn('[Theme] Unable to load account theme; using local theme.', error);
      }
    };

    hydrateThemeFromAccount();

    return () => {
      active = false;
    };
  }, [currentUser?.uid]);

  const setTheme = useCallback(async (nextThemeId) => {
    const nextTheme = getTheme(nextThemeId);
    setThemeId(nextTheme.id);

    if (!currentUser?.uid) return;

    try {
      const settingsRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      await setDoc(settingsRef, {
        themeId: nextTheme.id,
        themeUpdatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.warn('[Theme] Theme applied locally but account sync failed.', error);
    }
  }, [currentUser?.uid]);

  const value = useMemo(() => ({
    themeId,
    theme: getTheme(themeId),
    setTheme
  }), [themeId, setTheme]);

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
