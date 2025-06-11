import React, { lazy, Suspense, useRef, useState, useEffect } from 'react';
import Button from './Button';
import './App.css';
import AnnotationCanvas from './AnnotationCanvas'; // Import the new component
import DynamicRemoteComponent from './DynamicRemoteComponent';

import { domToPng } from 'modern-screenshot';

const remoteAppPort = 3000;


function App() {
  const annotationCanvasRef = useRef(null);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // Add loading state
  const [promptSuccess, setPromptSuccess] = useState(false); // Add state to track prompt loading
  const [message, setMessage] = useState('');
  const [claudeResponses, setClaudeResponses] = useState([]); // Change to array for history
  const [hasCommitsBeyondMain, setHasCommitsBeyondMain] = useState(false); // Add state for commit status

  const [availableRemoteComponents, setAvailableRemoteComponents] = useState([]);
  const [selectedRemoteComponent, setSelectedRemoteComponent] = useState('');

  useEffect(() => {
    async function fetchExposedComponents() {
      try {
        const response = await fetch(`http://localhost:${remoteAppPort}/exposes.json`);
        const components = await response.json();
        setAvailableRemoteComponents(components);
        // Select the first component
        const defaultComponent = components[1] || '';
        setSelectedRemoteComponent(defaultComponent);
      } catch (error) {
        console.error('Failed to fetch remote components manifest:', error);
      }
    }
    fetchExposedComponents();
  }, [isLoading]); // Refetch when loading state changes to get latest components after a server action

  const systemPrompt = `
  Context:

  The React component being edited is located at: \${targetComponentPath}
  The annotated screenshot of the React component is located at: \${screenshotPath}
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

      // Add a new empty response with a timestamp
      setClaudeResponses(prevResponses => [...prevResponses, { text: '', timestamp: new Date() }]);

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
        setClaudeResponses(prevResponses => {
          const lastResponse = prevResponses[prevResponses.length - 1];
          return [
            ...prevResponses.slice(0, -1),
            { ...lastResponse, text: lastResponse.text + event.data }
          ];
        });
      });

      // Listen for named 'end' events
     newEventSource.addEventListener('end', async (event) => {
       if (event.data) { // Check if there's data with the end event
         console.log(event.data);
         try {
           const endData = JSON.parse(event.data);
           setClaudeResponses(prevResponses => {
             const lastResponse = prevResponses[prevResponses.length - 1];
             if (!lastResponse) return prevResponses;
             return [
               ...prevResponses.slice(0, -1),
               { ...lastResponse, commit: endData.commit } // Add commit SHA to the last response
             ];
           });
           setPromptSuccess(true); // Start prompt loading
         } catch (parseError) {
           console.error('Failed to parse end event data:', parseError);
         }
       }

       // Close the EventSource connection
       newEventSource.close();
       eventSourceRef.current = null; // Clear the ref
       setIsLoading(false); // End loading on success
     });

     newEventSource.onerror = (error) => {
       console.error('EventSource failed. ReadyState:', newEventSource.readyState, 'Error object:', error);
       setClaudeResponses(prevResponses => {
         const lastResponse = prevResponses[prevResponses.length - 1];
         return [
           ...prevResponses.slice(0, -1),
           { ...lastResponse, text: lastResponse.text + "\nError connecting to stream.", timestamp: new Date() }
         ];
       });
       newEventSource.close();
       eventSourceRef.current = null; // Clear the ref
       setIsLoading(false); // End loading on error
     };
   } catch (err) {
     setIsLoading(false); // End loading on error
     console.error('Prompt failed:', err.message, err);
     setClaudeResponses(prevResponses => [...prevResponses, { text: `Error: ${err.message}`, timestamp: new Date() }]);
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

 const handleRevert = async (commit) => {
   setIsLoading(true);
   try {
     const response = await fetch('http://localhost:3001/api/undo', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ commit })
     });
     const data = await response.json();
     console.log('/api/undo response:', data);

     if (response.ok && data.commit) {
       // Find the index of the response with the reverted commit
       const revertToIndex = claudeResponses.findIndex(res => res.commit === data.commit);
       if (revertToIndex !== -1) {
         // Keep responses up to and including the reverted commit
         setClaudeResponses(prevResponses => prevResponses.slice(0, revertToIndex + 1));
       } else {
         // If the reverted commit is not found in the current responses, clear all responses
         setClaudeResponses([]);
       }
     } else {
       // Handle error response
       console.error('Revert failed:', data.message);
       // Optionally display an error message to the user
     }
   } catch (error) {
     console.error('Error calling /api/undo:', error);
     // Optionally display an error message to the user
   } finally {
     setIsLoading(false);
   }
 };

 const fetchBranchStatus = async () => {
   try {
     const response = await fetch('http://localhost:3001/api/branch-status');
     const data = await response.json();
     setHasCommitsBeyondMain(data.hasCommitsBeyondMain);
   } catch (error) {
     console.error('Error fetching branch status:', error);
     setHasCommitsBeyondMain(false);
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
 }, [isLoading]);

 // Check branch status when isLoading becomes false
 useEffect(() => {
   if (!isLoading) {
     fetchBranchStatus();
   }
 }, [isLoading]);

 // Clear responses when there are no commits beyond main
 useEffect(() => {
   if (!hasCommitsBeyondMain) {
     setClaudeResponses([]);
   }
 }, [hasCommitsBeyondMain]);

 // Close EventSource when component unmounts
 useEffect(() => {
   return () => {
     if (eventSourceRef.current) {
       eventSourceRef.current.close();
       eventSourceRef.current = null;
     }
   };
 }, []);

 // Take screenshot on promptSuccess and after the DOM has updated
 useEffect(() => {
   if (promptSuccess) {
     // Use setTimeout to wait for the next render tick after isLoading is false
     setTimeout(async () => {
       console.log('Taking screenshot after loading ends...');
       const node = document.querySelector('.main-content');
       let screenshotDataUrl = null;
       try {
         screenshotDataUrl = await domToPng(node);
       } catch (screenshotError) {
         console.error('Failed to take screenshot:', screenshotError);
       }

       // Finalize the last response with the screenshot
       setClaudeResponses(prevResponses => {
         const lastResponse = prevResponses[prevResponses.length - 1];
         if (!lastResponse) return prevResponses; // Handle case where responses might be empty
         return [
           ...prevResponses.slice(0, -1),
           { ...lastResponse, timestamp: new Date(), screenshot: screenshotDataUrl }
         ];
       });
       setPromptSuccess(false);
     }, 0); // 0ms delay pushes the execution to the next event loop cycle
   }
 }, [promptSuccess, setClaudeResponses]);

 return (
   <div className="app-container">
     <header className="sidebar">
       <div className="agent-response-history">
          {[...claudeResponses].reverse().map((response, index) => (
            <div key={index} className="agent-response">
              <div className="timestamp">{formatRelativeTime(response.timestamp)}</div>
              {!response.text && <div className="spinner"></div>}
              {response.text && <div className="response-text">{response.text}</div>}
              {response.screenshot && index !== 0 && <img src={response.screenshot} alt="Claude response screenshot" className="response-screenshot" />}
              {response.commit && index !== 0 && ( // Only show revert button if it's not the latest response
                <Button onClick={() => handleRevert(response.commit)} disabled={isLoading} styleType="secondary">Revert to this commit</Button>
              )}
            </div>
          ))}
       </div>
       <select
         id="component-selector"
         value={selectedRemoteComponent}
         onChange={(e) => setSelectedRemoteComponent(e.target.value)}
         disabled={availableRemoteComponents.length === 0}
       >
         {availableRemoteComponents.map((name) => (
           <option key={name} value={name}>
             {name.substring(2)}
           </option>
         ))}
       </select>
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
         <Button onClick={() => handleGitAction('/api/approve')} disabled={isLoading || !hasCommitsBeyondMain} styleType="secondary">💾</Button>
         <Button onClick={() => handleGitAction('/api/reset')} disabled={isLoading || !hasCommitsBeyondMain} styleType="secondary">🗑️</Button>
       </div>
     </header>
     <main className="main-content">
       <div id="remote-component-container">
         <DynamicRemoteComponent componentName={selectedRemoteComponent} />
       </div>
       <AnnotationCanvas ref={annotationCanvasRef} isVisible={isAnnotating} />

       {/* Progress Modal */}
       {isLoading && <div className="progress-modal-overlay"></div>}
     </main>
   </div>
 );
}

// Helper function to format relative time
function formatRelativeTime(timestamp) {
 const now = new Date();
 const secondsAgo = Math.round((now - new Date(timestamp)) / 1000);

 if (secondsAgo < 60) {
   return `${secondsAgo}s ago`;
 } else if (secondsAgo < 3600) {
   const minutesAgo = Math.round(secondsAgo / 60);
   return `${minutesAgo}m ago`;
 } else if (secondsAgo < 86400) {
   const hoursAgo = Math.round(secondsAgo / 3600);
   return `${hoursAgo}h ago`;
 } else {
   const daysAgo = Math.round(secondsAgo / 86400);
   return `${daysAgo}d ago`;
 }
}

export default App;
