export const THEME_STORAGE_KEY = 'smt-theme';

export const THEMES = {
  default: {
    id: 'default',
    name: 'Smart Money Default',
    description: 'Calm charcoal with emerald accents.',
    preview: {
      primary: '#32d296',
      secondary: '#60a5fa',
      accent: '#f6b94a',
      background: '#0b0d10'
    }
  },
  laBlueGold: {
    id: 'laBlueGold',
    name: 'LA Blue & Gold',
    description: 'Royal blue, electric blue, and warm gold on black.',
    preview: {
      primary: '#246BFD',
      secondary: '#5AA9FF',
      accent: '#FFD028',
      background: '#070b13'
    }
  },
  jacksonvilleTealGold: {
    id: 'jacksonvilleTealGold',
    name: 'Jacksonville Teal & Gold',
    description: 'Deep teal, bright aqua, and metallic gold.',
    preview: {
      primary: '#00B2B2',
      secondary: '#26D8D8',
      accent: '#D7A63B',
      background: '#061012'
    }
  },
  pittsburghBlackGold: {
    id: 'pittsburghBlackGold',
    name: 'Pittsburgh Black & Gold',
    description: 'High-contrast black, steel gray, and vivid gold.',
    preview: {
      primary: '#FFB612',
      secondary: '#F5C842',
      accent: '#FFD94A',
      background: '#080808'
    }
  }
};

export const THEME_LIST = Object.values(THEMES);

export const getTheme = (themeId) => THEMES[themeId] || THEMES.default;
