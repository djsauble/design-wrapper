const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('@module-federation/enhanced/webpack');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const path = require('path');
const deps = require('./package.json').dependencies;
require('dotenv').config({ path: './.env' });

// Load environment variables
// Make sure you have a .env file in serve-react-app with TARGET_APP_PATH, TARGET_APP_ENTRY_POINT, and SERVE_PORT
// or define them directly here if you prefer.
if (!process.env.TARGET_APP_PATH || !process.env.TARGET_APP_ENTRY_POINT) {
  throw new Error('TARGET_APP_PATH and TARGET_APP_ENTRY_POINT must be defined in .env or environment');
}
const targetAppPath = process.env.TARGET_APP_PATH;
const targetAppEntryPoint = process.env.TARGET_APP_ENTRY_POINT;
const servePort = process.env.SERVE_PORT || 3000; // Default port if not specified
const isDevelopment = process.env.NODE_ENV !== 'production';

module.exports = {
  mode: isDevelopment ? 'development' : 'production',
  entry: './src/index.js', // Create this dummy entry if it doesn't exist, Webpack needs an entry
  output: {
    publicPath: `http://localhost:${servePort}/`, // URL for the remote app
    // filename: '[name].[contenthash].js', // Add contenthash for production if needed
    // path: path.resolve(__dirname, 'dist'), // Output directory
  },
  devServer: {
    port: servePort,
    hot: true, // HMR is enabled by default
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
            plugins: [
              //isDevelopment && require.resolve('react-refresh/babel')
            ].filter(Boolean),
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
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
        // Webpack needs an absolute path or a path relative to the context (which is serve-react-app by default)
        './Component': path.resolve(targetAppPath, targetAppEntryPoint),
      },
      shared: {
        ...deps, // Share dependencies from package.json
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
    // Your serve-react-app/index.html seems to be for this purpose.
    new HtmlWebpackPlugin({
      template: './index.html', // Path to your host HTML file
    }),
    //isDevelopment && new ReactRefreshWebpackPlugin(),
  ].filter(Boolean),
  resolve: {
    extensions: ['.js', '.jsx'],
    // If your hello-world-app uses aliases, configure them here
    // alias: {
    //   // Example:
    //   // Components: path.resolve(__dirname, '..', targetAppPath, 'src/components'),
    // },
  },
};
