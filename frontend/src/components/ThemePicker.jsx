import React from 'react';
import { THEME_LIST } from '../config/themes';
import { useTheme } from '../contexts/ThemeContext';
import './ThemePicker.css';

const ThemePicker = () => {
  const { themeId, setTheme } = useTheme();

  return (
    <div className="settings-tile theme-picker-tile">
      <div className="theme-picker-header">
        <div>
          <div className="theme-picker-eyebrow">Appearance</div>
          <h3>🎨 App Theme</h3>
          <p>Choose the visual style for Smart Money Tracker. Changes apply instantly.</p>
        </div>
        <span className="theme-picker-badge">Premium themes</span>
      </div>

      <div className="theme-picker-grid">
        {THEME_LIST.map((theme) => {
          const selected = theme.id === themeId;

          return (
            <button
              type="button"
              key={theme.id}
              className={`theme-option theme-option-${theme.id} ${selected ? 'selected' : ''}`}
              onClick={() => setTheme(theme.id)}
              aria-pressed={selected}
            >
              <div
                className={`theme-preview theme-preview-${theme.id}`}
                style={{
                  '--preview-bg': theme.preview.background,
                  '--preview-primary': theme.preview.primary,
                  '--preview-secondary': theme.preview.secondary,
                  '--preview-accent': theme.preview.accent
                }}
              >
                <div className="theme-preview-sidebar">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="theme-preview-main">
                  <div className="theme-preview-hero" />
                  <div className="theme-preview-row">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>

              <div className="theme-option-copy">
                <div className="theme-option-name-row">
                  <strong>{theme.name}</strong>
                  {selected && <span className="theme-selected-pill">Selected</span>}
                </div>
                <span>{theme.description}</span>
                <span className="theme-option-signature">{theme.signature}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="theme-picker-note">
        Fan-inspired themes use generic regional/color names and original visual effects so the product can stay commercially flexible.
      </div>
    </div>
  );
};

export default ThemePicker;
