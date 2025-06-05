import React, { useEffect, lazy, Suspense } from 'react';
import './App.css';
import html2canvas from 'html2canvas';

const RemoteComponent = lazy(() => import('remoteApp/Component'));

function App() {
  const handleScreenshot = async () => {
    const element = document.querySelector('.host-content');
    if (element) {
      const canvas = await html2canvas(element, { allowTaint: true, useCORS: true });
      const dataUrl = canvas.toDataURL('image/png');

      try {
        const response = await fetch('http://localhost:3001/api/data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ screenshot: dataUrl }),
        });

        if (response.ok) {
          console.log('Screenshot sent successfully!');
        } else {
          console.error('Failed to send screenshot:', response.statusText);
        }
      } catch (error) {
        console.error('Error sending screenshot:', error);
      }
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
