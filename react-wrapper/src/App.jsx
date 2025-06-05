import React, { lazy, Suspense, useRef } from 'react';
import './App.css';
import AnnotationCanvas from './AnnotationCanvas'; // Import the new component

const RemoteComponent = lazy(() => import('remoteApp/Component'));

import { domToPng } from 'modern-screenshot';

function App() {
  const annotationCanvasRef = useRef(null);
  const [isAnnotating, setIsAnnotating] = React.useState(false);
  const [message, setMessage] = React.useState('');

  const sendPrompt = async () => {
    try {
      const node = document.querySelector('.main-content');

      if (!node) {
        throw new Error('Could not find .main-content element');
      }

      const dataUrl = await domToPng(node);

      // Send base64 image string, message, and directory to the /api/data endpoint
      await fetch('http://localhost:3001/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screenshot: dataUrl,
          message: message
        })
      });
      console.log('Screenshot and message sent to server!');
    } catch (err) {
      console.log('Screenshot failed: ' + err.message);
    }
  };

  const handleAnnotateToggle = () => {
    if (isAnnotating) {
      // If turning off annotation, clear the canvas
      annotationCanvasRef.current?.clearCanvas();
    }
    setIsAnnotating(!isAnnotating);
  };

  return (
    <div className="app-container">
      <header className="sidebar">
        <h1>Host Application Shell</h1>
        <div className="agent-response-placeholder">
          {/* Dummy div for agent response */}
          Agent response will go here.
        </div>
        <textarea
          placeholder="What change do you want to make?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows="4"
          cols="30"
        />
        <div className="sidebar-buttons">
          <button onClick={sendPrompt}>Submit</button>
          <button onClick={handleAnnotateToggle}>{isAnnotating ? 'Clear' : 'Annotate'}</button>
        </div>
      </header>
      <main className="main-content">
        {/* Remote component will mount here */}
        <Suspense fallback="Loading remote component...">
          <RemoteComponent />
        </Suspense>
        {/* Add the annotation canvas */}
        <AnnotationCanvas ref={annotationCanvasRef} isVisible={isAnnotating} />
      </main>
    </div>
  )
}

export default App
