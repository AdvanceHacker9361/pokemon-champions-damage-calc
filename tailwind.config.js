const config = {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // Pokemon type colors
                'type-normal': '#A8A878',
                'type-fire': '#F08030',
                'type-water': '#6890F0',
                'type-electric': '#F8D030',
                'type-grass': '#78C850',
                'type-ice': '#98D8D8',
                'type-fighting': '#C03028',
                'type-poison': '#A040A0',
                'type-ground': '#E0C068',
                'type-flying': '#A890F0',
                'type-psychic': '#F85888',
                'type-bug': '#A8B820',
                'type-rock': '#B8A038',
                'type-ghost': '#705898',
                'type-dragon': '#7038F8',
                'type-dark': '#705848',
                'type-steel': '#B8B8D0',
                'type-fairy': '#EE99AC',
            },
        },
    },
    plugins: [],
};
export default config;
