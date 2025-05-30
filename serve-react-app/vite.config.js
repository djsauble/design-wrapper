import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'
import path from 'path'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Validate required environment variables
const targetPath = process.env.VITE_TARGET_APP_PATH
const entryPoint = process.env.VITE_TARGET_APP_ENTRY_POINT

if (!targetPath || !entryPoint) {
  throw new Error('VITE_TARGET_APP_PATH and VITE_TARGET_APP_ENTRY_POINT must be defined in .env')
}

export default defineConfig({
  plugins: [
    react({
      include: '**/*.{jsx,js}' // Allow JSX in .js files
    }),
    federation({
      name: 'remote-app',
      filename: 'remoteEntry.js',
      exposes: {
        // Dynamically expose the component from env variables
        './Component': path.join(targetPath, entryPoint)
      },
      shared: ['react', 'react-dom'],
      library: { type: 'module' }
    })
  ],
  base: '/',  // Set base URL to root
  publicDir: 'public',
  server: {
    port: process.env.VITE_SERVE_PORT,
    strictPort: true
  },
  preview: {
    port: process.env.VITE_SERVE_PORT,
    strictPort: true,
    host: true
  },
  build: {
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
    rollupOptions: {
      external: ['react', 'react-dom'],
    }
  },
  esbuild: {
    loader: 'jsx',
    include: /\.[jt]sx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  }
})