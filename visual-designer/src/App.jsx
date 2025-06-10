import React, { lazy, Suspense, useRef, useState, useEffect } from 'react';
import Button from './Button';
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

  const systemPrompt = `
  Context:

  The React component being edited is located at: \${targetComponentPath}
  The annotated screenshot of the Reaact component is located at: \${screenshotPath}
  Additional context from the user: "\${userMessage}"

  Main rules:

  * Please make direct changes to the code files based on what you see in the screenshot and the additional context from the user (if any).
  * Do not make changes outside of the current working directory.
  * Do not just suggest changes - actually implement them.
  * The annotations in the screenshot are low-fidelity and intended to communicate changes, so don't reproduce them exactly. For example, there may be arrows or text that show what changes are desired. The color of the annotations are always red, but that doesn't mean you should make the changes red.
  * Once you make the changes, reply with a summary of the changes in a single paragraph with no special formatting.
  
  Specific instructions:
  `;

  const promptTemplates = {
    'Add component': `${systemPrompt}\nAdd new component(s) to the code as needed. Optimize for modularity and reusability.`,
    'Remove component': `${systemPrompt}\nRemove the specified component(s) from the code as needed.`,
    'Edit component': `${systemPrompt}\nEdit the specified component(s) in the code as needed. Prefer changes to the existing code or direct imports rather than creating new files or editing files unrelated to or upstream of the existing component(s).`,
    'Adjust layout': `${systemPrompt}\nAdjust the layout of the page and components in the code as needed.`,
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
        setClaudeResponse(prev => prev + event.data);
      });

      // Listen for named 'end' events
      newEventSource.addEventListener('end', (event) => {
        if (event.data) { // Check if there's data with the end event
          console.log(event.data);
        }
        newEventSource.close();
        eventSourceRef.current = null; // Clear the ref
        setIsLoading(false); // End loading on success
      });

      newEventSource.onerror = (error) => {
        console.error('EventSource failed. ReadyState:', newEventSource.readyState, 'Error object:', error);
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

  const handleGitAction = async (endpoint) => {
    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:3001${endpoint}`, {
        method: 'POST',
      });
      const data = await response.json();
      console.log(`${endpoint} response:`, data);
      // Optionally display a message to the user based on the response
    } catch (error) {
      console.error(`Error calling ${endpoint}:`, error);
      // Optionally display an error message to the user
    } finally {
      setIsLoading(false);
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
          <Button onClick={sendPrompt} disabled={isLoading} styleType="primary">Submit</Button>
          <Button onClick={handleAnnotateToggle} disabled={isLoading} styleType="secondary">{isAnnotating ? 'Clear' : 'Annotate'}</Button>
          <Button onClick={() => handleGitAction('/api/undo')} disabled={isLoading} styleType="secondary">↺</Button>
          <Button onClick={() => handleGitAction('/api/approve')} disabled={isLoading} styleType="secondary">💾</Button>
          <Button onClick={() => handleGitAction('/api/reset')} disabled={isLoading} styleType="secondary">🗑️</Button>
        </div>
        { claudeResponse !== '' && (
          <div className="agent-response">{claudeResponse}</div>
        )}
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
