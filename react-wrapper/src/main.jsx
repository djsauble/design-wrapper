import './index.css'
import React from 'react'
import App from './App.jsx'

// This is a workaround to make `@pmmmwh/react-refresh-webpack-plugin` support Module Federation.
// https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/516
// <HACK>
import * as refresh_runtime from 'react-refresh/runtime'; // Must be imported before ReactDOM
import ReactDOM from 'react-dom/client';
Object.assign(window, { __sharing_react_refresh_runtime__: refresh_runtime });
// <HACK/>

// Create root and render App
const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
