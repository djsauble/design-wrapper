import React, { useEffect, lazy, Suspense } from 'react';
import './App.css'

const RemoteComponent = lazy(() => import('remoteApp/Component'));

function App() {
  return (
    <div className="host-container">
      <header className="host-header">
        <h1>Host Application Shell</h1>
      </header>
      <main className="host-content">
        {/* Remote component will mount here */}
        <Suspense fallback="Loading remote component...">
          <RemoteComponent />
        </Suspense>
      </main>
    </div>
  )
}

export default App
