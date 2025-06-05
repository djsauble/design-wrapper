import React, { lazy, Suspense, useRef } from 'react';
import './App.css';
import AnnotationCanvas from './AnnotationCanvas'; // Import the new component

const RemoteComponent = lazy(() => import('remoteApp/Component'));

import domtoimage from 'dom-to-image';

function App() {
  const annotationCanvasRef = useRef(null);

  const handleScreenshot = async () => {
    try {
      const node = document.querySelector('.main-content');
      console.log(node);

      if (!node) {
        throw new Error('Could not find .main-content element');
      }

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
    <div className="app-container">
      <header className="sidebar">
        <h1>Host Application Shell</h1>
        <div className="agent-response-placeholder">
          {/* Dummy div for agent response */}
          Agent response will go here.
        </div>
        <div className="sidebar-buttons">
          <button onClick={handleScreenshot}>Take Screenshot</button>
          <button onClick={() => annotationCanvasRef.current?.clearCanvas()}>Clear</button>
        </div>
      </header>
      <main className="main-content">
        {/* Remote component will mount here */}
        <Suspense fallback="Loading remote component...">
          <RemoteComponent />
        </Suspense>
        {/* Add the annotation canvas */}
        <AnnotationCanvas ref={annotationCanvasRef} />
      </main>
    </div>
  )
}

export default App
