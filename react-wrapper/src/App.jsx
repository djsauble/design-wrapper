import React, { lazy, Suspense, useRef, useState, useEffect } from 'react';
import './App.css';
import AnnotationCanvas from './AnnotationCanvas'; // Import the new component

const RemoteComponent = lazy(() => import('remoteApp/Component'));

import { domToPng } from 'modern-screenshot';

function App() {
  const annotationCanvasRef = useRef(null);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [message, setMessage] = useState('');
  const [claudeResponse, setClaudeResponse] = useState('');
  const [promptTemplate, setPromptTemplate] = useState(`Please analyze the annotated screenshot at \${screenshotPath} and make changes to the code as needed.

Additional context from the user: \${userMessage}

Please make direct changes to the code files based on what you see in the screenshot. Do not make changes outside of the current working directory. Do not just suggest changes - actually implement them. The annotations are low-fidelity and intended to communicate changes, so don't reproduce them exactly. For example, there may be arrows or text that show what changes are desired. The color of the annotations are always red, but that doesn't mean you should make the changes red.`);
  const eventSourceRef = useRef(null);

  const sendPrompt = async () => {
    try {
      // Close any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const node = document.querySelector('.main-content');
      if (!node) {
        throw new Error('Could not find .main-content element');
      }

      const dataUrl = await domToPng(node);

      // Clear previous response
      setClaudeResponse('');
      console.log('Claude response cleared.');

      // Upload screenshot first
      console.log('Uploading screenshot...');
      const uploadResponse = await fetch('http://localhost:3001/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screenshot: dataUrl })
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText} (status: ${uploadResponse.status})`);
      }

      const { filename } = await uploadResponse.json();

      // Establish SSE connection with filename
      const sseUrl = `http://localhost:3001/api/data?filename=${encodeURIComponent(filename)}&message=${encodeURIComponent(message)}&promptTemplate=${encodeURIComponent(promptTemplate)}`;
      const newEventSource = new EventSource(sseUrl);
      eventSourceRef.current = newEventSource; // Store the new EventSource instance

      // Listen for named 'data' events
      newEventSource.addEventListener('data', (event) => {
        // Assuming event.data is a string. If it's JSON, parse it.
        // e.g., const parsedData = JSON.parse(event.data);
        setClaudeResponse(prev => prev + event.data);
      });

      // Listen for named 'end' events
      newEventSource.addEventListener('end', (event) => {
        // Optionally, you could append the 'end' event data too, or handle it differently.
        // For example: setClaudeResponse(prev => prev + "\nStream finished: " + event.data);
        if (event.data) { // Check if there's data with the end event
            setClaudeResponse(prev => prev + (prev ? "\n" : "") + `Final message: ${event.data}`);
        }
        newEventSource.close();
        eventSourceRef.current = null; // Clear the ref
      });

      newEventSource.onerror = (error) => {
        // The 'error' event object for EventSource is usually a generic Event.
        // The actual error details are often not directly in 'error.data'.
        // It indicates a connection error.
        console.error('EventSource failed. ReadyState:', newEventSource.readyState, 'Error object:', error);
        // Additional error information might be logged by the browser itself.
        // Consider logging the URL or other context if errors persist.
        setClaudeResponse(prev => prev + "\nError connecting to stream.");
        newEventSource.close();
        eventSourceRef.current = null; // Clear the ref
      };

    } catch (err) {
      console.error('Prompt failed:', err.message, err);
      setClaudeResponse(`Error: ${err.message}`);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }
  };

  const handleAnnotateToggle = () => {
    if (isAnnotating) {
      annotationCanvasRef.current?.clearCanvas();
    }
    setIsAnnotating(!isAnnotating);
  };

  // Cleanup useEffect to close EventSource when component unmounts
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []); // Empty dependency array ensures this runs only on mount and unmount

  return (
    <div className="app-container">
      <header className="sidebar">
        <div className="agent-response-placeholder" style={{ whiteSpace: 'pre-wrap' }}>
          {/* Display streamed agent response */}
          {claudeResponse || 'Agent response will go here.'}
        </div>
        <textarea
          placeholder="Edit prompt template here..."
          value={promptTemplate}
          onChange={(e) => setPromptTemplate(e.target.value)}
          rows="10"
          cols="30"
        />
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
        <Suspense fallback="Loading remote component...">
          <RemoteComponent />
        </Suspense>
        <AnnotationCanvas ref={annotationCanvasRef} isVisible={isAnnotating} />
      </main>
    </div>
  );
}

export default App;
