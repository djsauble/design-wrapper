const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('webpack').container;
const path = require('path');
const deps = require('./package.json').dependencies;

const remoteAppPort = process.env.SERVE_REACT_APP_PORT || 3000; // Port of the remoteApp
const hostAppPort = process.env.HOST_APP_PORT || 5173;   // Port for this host app

module.exports = {
  mode: 'development',
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
            presets: ['@babel/preset-env', ['@babel/preset-react', {runtime: 'automatic'}]],
             // Add react-refresh/babel for HMR of React components
            plugins: [require.resolve('react-refresh/babel')].filter(Boolean),
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
        },
        'react-dom': {
          singleton: true,
          requiredVersion: deps['react-dom'],
        },
      },
    }),
    new HtmlWebpackPlugin({
      template: './index.html',
    }),
  ].filter(Boolean),
  resolve: {
    extensions: ['.js', '.jsx'],
  },
};