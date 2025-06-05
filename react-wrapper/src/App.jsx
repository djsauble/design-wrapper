import React, { lazy, Suspense } from 'react';
import './App.css';

const RemoteComponent = lazy(() => import('remoteApp/Component'));

import domtoimage from 'dom-to-image';

function App() {
  const handleScreenshot = async () => {
    try {
      const node = document.querySelector('.host-content');
      if (!node) throw new Error('Could not find .host-content element');
      const dataUrl = await domtoimage.toPng(node);
      // Send base64 image string to the /api/data endpoint
      await fetch('http://localhost:3001/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screenshot: dataUrl })
      });
      console.log('Screenshot sent to server!');
    } catch (err) {
      console.log('Screenshot failed: ' + err.message);
    }
  };

  return (
    <div className="host-container">
      <header className="host-header">
        <h1>Host Application Shell</h1>
        <button onClick={handleScreenshot}>Take Screenshot</button>
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
