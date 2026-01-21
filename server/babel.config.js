/**
 * Конфигурация Babel для Jest
 */

export default {
    presets: [
        ['@babel/preset-env', {
            targets: {
                node: 'current'
            },
            modules: 'auto'
        }]
    ]
};

