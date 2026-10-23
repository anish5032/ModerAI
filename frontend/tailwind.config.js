export default {content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        canvas: '#F6F8FB',
        surface: '#FFFFFF',
        panel: '#F8FAFC',
        raised: '#F1F5F9',
        line: '#E2E8F0',
        'line-soft': '#EEF2F7',
        ink: '#0F172A',
        'ink-muted': '#51607A',
        'ink-faint': '#94A3B8',
        accent: '#4F46E5',
        low: '#10B981',
        moderate: '#F59E0B',
        high: '#F97316',
        critical: '#E11D48',
        blur: '#8B5CF6',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 8px 24px -16px rgba(15, 23, 42, 0.18)',
        raised: '0 2px 4px -1px rgba(15, 23, 42, 0.06), 0 16px 32px -20px rgba(15, 23, 42, 0.3)',
      },
    },
  },
}
