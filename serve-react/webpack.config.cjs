const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('@module-federation/enhanced/webpack');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const PostcssPrefixSelector = require('postcss-prefix-selector');
const path = require('path');
const deps = require('./package.json').dependencies;
require('dotenv').config({ path: '../.env' });
const glob = require('glob');
const fs = require('fs');

// Load environment variables
if (!process.env.TARGET_APP_PATH) {
  throw new Error('TARGET_APP_PATH must be defined in .env or environment');
}
if (!process.env.TARGET_APP_COMPONENTS_DIR) {
  throw new Error('TARGET_APP_COMPONENTS_DIR must be defined in .env or environment');
}
if (!process.env.TARGET_APP_ROOT_COMPONENT) {
  throw new Error('TARGET_APP_ROOT_COMPONENT must be defined in .env or environment');
}
const targetAppPath = process.env.TARGET_APP_PATH;
const targetAppComponentsDir = process.env.TARGET_APP_COMPONENTS_DIR;
const targetAppEntryPoint = process.env.TARGET_APP_ROOT_COMPONENT;
const targetAppAssetsRoot = path.resolve(targetAppPath, process.env.TARGET_APP_ASSETS_ROOT);
const servePort = process.env.SERVE_REACT_APP_PORT || 3000; // Default port if not specified
const isDevelopment = process.env.NODE_ENV !== 'production';

// Dynamically generate the exposes object by scanning the target directory
const scannedDir = path.resolve(targetAppPath, targetAppComponentsDir);
const exposableComponents = glob.sync(`${scannedDir}/**/*.{js,jsx}`).reduce((acc, file) => {
  // Create a relative path from scannedDir, then use it for the expose key
  const relativePath = path.relative(scannedDir, file);
  // Get component name from filename without extension
  const componentName = path.basename(relativePath, path.extname(relativePath));
  const exposeKey = `./${componentName}`;
  acc[exposeKey] = path.resolve(__dirname, file);
  return acc;
}, {});

const outputDir = path.resolve(__dirname, 'dist');
if (!fs.existsSync(outputDir)){
    fs.mkdirSync(outputDir, { recursive: true });
}
fs.writeFileSync(
  path.join(outputDir, 'exposes.json'),
  JSON.stringify(Object.keys(exposableComponents))
);

module.exports = {
  mode: isDevelopment ? 'development' : 'production',
  entry: './src/index.js',
  output: {
    path: outputDir,
    publicPath: 'auto',
  },
  devServer: {
    static: {
      directory: outputDir,
    },
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
            options: {
              assetRoot: targetAppAssetsRoot,
            }
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
      exposes: exposableComponents,
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
  resolve: {
    extensions: ['.js', '.jsx'],
  }
};
