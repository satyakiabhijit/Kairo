export const DEFAULT_SETTINGS = {
  autoEnrich: false,
  showFloatingButton: true,
  apiKey: '',
};

export function normalizeSettings(settings = {}) {
  return {
    autoEnrich: settings.autoEnrich === true,
    showFloatingButton: settings.showFloatingButton !== false,
    apiKey: typeof settings.apiKey === 'string' ? settings.apiKey.trim() : '',
  };
}
