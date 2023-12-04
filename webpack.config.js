const path = require('path');

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  target: 'web',
  performance: {
    maxEntrypointSize: 1000000,
    maxAssetSize: 10000000,
  },
};
