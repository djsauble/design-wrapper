import React, { lazy, Suspense, useRef, useState, useEffect } from 'react';
import './App.css';
import AnnotationCanvas from './AnnotationCanvas'; // Import the new component

const RemoteComponent = lazy(() => import('remoteApp/Component'));

import { domToPng } from 'modern-screenshot';

function App() {
  const annotationCanvasRef = useRef(null);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // Add loading state
  const [message, setMessage] = useState('');
  const [claudeResponse, setClaudeResponse] = useState('');
  const systemPrompt = `Additional context from the user: "\${userMessage}". Please make direct changes to the code files based on what you see in the screenshot and the additional context from the user (if any). Do not make changes outside of the current working directory. Do not just suggest changes - actually implement them. The annotations are low-fidelity and intended to communicate changes, so don't reproduce them exactly. For example, there may be arrows or text that show what changes are desired. The color of the annotations are always red, but that doesn't mean you should make the changes red. Once you make the changes, reply with a summary of the changes in a single paragraph with no special formatting.`;

  const promptTemplates = {
    'Add component': `Please analyze the annotated screenshot at \${screenshotPath} and add new component(s) to the code as needed. ${systemPrompt}`,
    'Remove component': `Please analyze the annotated screenshot at \${screenshotPath} and remove the specified component(s) from the code as needed. ${systemPrompt}`,
    'Edit component': `Please analyze the annotated screenshot at \${screenshotPath} and edit the specified component(s) in the code as needed. ${systemPrompt}`,
    'Adjust layout': `Please analyze the annotated screenshot at \${screenshotPath} and adjust the layout of the page in the code as needed. ${systemPrompt}`,
  };

  const [selectedPromptType, setSelectedPromptType] = useState('Add component');
  const [promptTemplate, setPromptTemplate] = useState(promptTemplates[selectedPromptType]);
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

      setIsLoading(true); // Show the loading modal only after the screenshot has been taken

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
          console.log(event.data);
        }
        newEventSource.close();
        eventSourceRef.current = null; // Clear the ref
        setIsLoading(false); // End loading on success
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
        setIsLoading(false); // End loading on error
      };

    } catch (err) {
      setIsLoading(false); // End loading on error
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

  // Clear the canvas once we've received a response from Claude
  useEffect(() => {
    if (isAnnotating && !isLoading) {
      annotationCanvasRef.current?.clearCanvas();
      setIsAnnotating(false);
    }
  }, [isLoading])

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
        <select
          value={selectedPromptType}
          onChange={(e) => {
            setSelectedPromptType(e.target.value);
            setPromptTemplate(promptTemplates[e.target.value]);
          }}
        >
          {Object.keys(promptTemplates).map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <textarea
          placeholder="Optional: Provide additional context for the agent..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows="4"
          cols="30"
        />
        <div className="sidebar-buttons">
          <button onClick={sendPrompt} disabled={isLoading}>Submit</button>
          <button onClick={handleAnnotateToggle} disabled={isLoading}>{isAnnotating ? 'Clear' : 'Annotate'}</button>
        </div>
      </header>
      <main className="main-content">
        <div id="remote-component-container">
          <Suspense fallback="Loading remote component...">
            <RemoteComponent />
          </Suspense>
        </div>
        <AnnotationCanvas ref={annotationCanvasRef} isVisible={isAnnotating} />

        {/* Progress Modal */}
        {isLoading && (
          <div className="progress-modal-overlay">
            <div className="progress-modal-content">
              <div className="spinner"></div> {/* Simple spinner placeholder */}
              <p>Processing...</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
