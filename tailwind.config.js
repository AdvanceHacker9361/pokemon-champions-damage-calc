const config = {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // ===== セマンティックトークン（CSS変数参照・テーマ自動切替） =====
                app: 'var(--bg-app)',
                surface: {
                    1: 'var(--bg-surface-1)',
                    2: 'var(--bg-surface-2)',
                    3: 'var(--bg-surface-3)',
                },
                edge: {
                    DEFAULT: 'var(--border-default)',
                    subtle: 'var(--border-subtle)',
                    strong: 'var(--border-strong)',
                },
                fg: {
                    DEFAULT: 'var(--text-primary)',
                    muted: 'var(--text-secondary)',
                    subtle: 'var(--text-tertiary)',
                    faint: 'var(--text-disabled)',
                },
                accent: {
                    DEFAULT: 'var(--accent)',
                    hover: 'var(--accent-hover)',
                    bg: 'var(--accent-bg)',
                    border: 'var(--accent-border)',
                },
                danger: {
                    1: 'var(--danger-1)',
                    2: 'var(--danger-2)',
                    3: 'var(--danger-3)',
                    4: 'var(--danger-4)',
                },
                neutral: 'var(--neutral)',
                success: 'var(--success)',
                warning: 'var(--warning)',
                error: 'var(--error)',

                // ===== タイプ色（彩度を一段落とした版・バッジ内専用） =====
                'type-normal': '#9c9c8e',
                'type-fire': '#c7472b',
                'type-water': '#3a7ab8',
                'type-electric': '#c2a430',
                'type-grass': '#5a9242',
                'type-ice': '#6ab3c2',
                'type-fighting': '#a83a2b',
                'type-poison': '#8e3a8e',
                'type-ground': '#b87842',
                'type-flying': '#7896c2',
                'type-psychic': '#c25a85',
                'type-bug': '#8aa033',
                'type-rock': '#a89255',
                'type-ghost': '#5a4a85',
                'type-dragon': '#4a5db8',
                'type-dark': '#3a2e23',
                'type-steel': '#7a8a95',
                'type-fairy': '#c280a0',
            },
        },
    },
    plugins: [],
};
export default config;
