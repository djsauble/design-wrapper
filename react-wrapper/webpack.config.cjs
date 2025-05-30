const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('webpack').container;
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const path = require('path');
const deps = require('./package.json').dependencies;

const isDevelopment = process.env.NODE_ENV !== 'production';

const remoteAppPort = process.env.SERVE_REACT_APP_PORT || 3000; // Port of the remoteApp
const hostAppPort = process.env.HOST_APP_PORT || 5173;   // Port for this host app

module.exports = {
  mode: isDevelopment ? 'development' : 'production',
  entry: './src/main.jsx', // Your existing entry point
  output: {
    publicPath: 'auto', // Or `http://localhost:${hostAppPort}/`
  },
  devServer: {
    port: hostAppPort,
    hot: true, // Enable HMR
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    // historyApiFallback: true, // If you use client-side routing
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
              isDevelopment && require.resolve('react-refresh/babel')
            ].filter(Boolean),
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    process.env.NODE_ENV === 'development' && new (require('react-refresh-webpack-plugin'))(),
    new ModuleFederationPlugin({
      name: 'hostApp',
      remotes: {
        // The URL for remoteEntry.js of your remote app
        remoteApp: `remoteApp@http://localhost:${remoteAppPort}/remoteEntry.js`,
      },
      shared: {
        ...deps,
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
    new HtmlWebpackPlugin({
      template: './index.html',
    }),
    // Add the ReactRefreshWebpackPlugin only in development
    isDevelopment && new ReactRefreshWebpackPlugin(),
  ].filter(Boolean),
  resolve: {
    extensions: ['.js', '.jsx'],
  },
};