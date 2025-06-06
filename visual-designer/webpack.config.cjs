const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('@module-federation/enhanced/webpack');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const path = require('path');
const deps = require('./package.json').dependencies;
require('dotenv').config({ path: '../.env' });

const isDevelopment = process.env.NODE_ENV !== 'production';

const remoteAppPort = process.env.SERVE_REACT_APP_PORT || 3000; // Port of the remoteApp
const hostAppPort = process.env.VISUAL_DESIGNER_APP_PORT || 5173;   // Port for this host app

module.exports = {
  mode: isDevelopment ? 'development' : 'production',
  entry: './src/main.jsx',
  output: {
    publicPath: 'auto',
  },
  devServer: {
    port: hostAppPort,
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
            presets: ['@babel/preset-react'],
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
    new ModuleFederationPlugin({
      name: 'hostApp',
      remotes: {
        remoteApp: `remoteApp@http://localhost:${remoteAppPort}/remoteEntry.js`,
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
        'modern-screenshot': {
          singleton: true,
          requiredVersion: deps['modern-screenshot'],
          eager: true,
        },
      },
    }),
    new HtmlWebpackPlugin({
      template: './index.html',
    }),
    isDevelopment && new ReactRefreshWebpackPlugin(),
  ].filter(Boolean),
  resolve: {
    extensions: ['.js', '.jsx'],
  },
};