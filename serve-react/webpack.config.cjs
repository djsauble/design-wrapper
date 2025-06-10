const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('@module-federation/enhanced/webpack');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const PostcssPrefixSelector = require('postcss-prefix-selector');
const path = require('path');
const deps = require('./package.json').dependencies;
require('dotenv').config({ path: '../.env' });

// Load environment variables
if (!process.env.TARGET_APP_PATH || !process.env.TARGET_APP_ENTRY_POINT) {
  throw new Error('TARGET_APP_PATH and TARGET_APP_ENTRY_POINT must be defined in .env or environment');
}
const targetAppPath = process.env.TARGET_APP_PATH;
const targetAppEntryPoint = process.env.TARGET_APP_ENTRY_POINT;
const servePort = process.env.SERVE_REACT_APP_PORT || 3000; // Default port if not specified
const isDevelopment = process.env.NODE_ENV !== 'production';

module.exports = {
  mode: isDevelopment ? 'development' : 'production',
  entry: './src/index.js',
  output: {
    publicPath: 'auto',
  },
  devServer: {
    port: servePort,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-react'],
              plugins: [
                isDevelopment && require.resolve('react-refresh/babel')
              ].filter(Boolean),
            },
          },
          {
            loader: path.resolve('./src/fix-imports-loader.js'),
          },
        ],
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader',
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                plugins: [
                  PostcssPrefixSelector({
                    prefix: '#remote-component-container',
                  }),
                ],
              },
            },
          },
        ],
      },
      {
        test: /\.(svg|png|jpe?g|gif)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'remoteApp', // Matches the name used in the host
      filename: 'remoteEntry.js',
      exposes: {
        // Webpack needs an absolute path or a path relative to the context (which is serve-react by default)
        './Component': path.resolve(targetAppPath, targetAppEntryPoint),
      },
      shared: {
        react: {
          singleton: true,
          requiredVersion: deps.react,
          eager: true,
        },
        'react-dom': {
          singleton: true,
          requiredVersion: deps['react-dom'],
          eager: true,
        },
      },
    }),
    // HtmlWebpackPlugin is often not strictly needed for a remote that only exposes modules,
    // but it's useful if you want to test the remote directly or if it has its own shell.
    // Your serve-react/index.html seems to be for this purpose.
    new HtmlWebpackPlugin({
      template: './index.html', // Path to your host HTML file
    }),
    isDevelopment && new ReactRefreshWebpackPlugin(),
  ].filter(Boolean),
};
