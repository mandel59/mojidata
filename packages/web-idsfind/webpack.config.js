const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: './src/entry.js',
  output: {
    path: path.resolve(__dirname, 'public'),
    filename: 'bundle.js',
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'Mojidata IDS Find'
    }),
  ],
  performance: {
    assetFilter(assetFilename) {
      return assetFilename.endsWith('.js')
    },
  },
  experiments: {
    topLevelAwait: true,
  },
};
