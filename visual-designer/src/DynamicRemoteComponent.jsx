import React, { lazy, Suspense } from 'react';
import { loadRemote } from '@module-federation/enhanced/runtime';
import ErrorBoundary from './ErrorBoundary'; // Adjust the import path as needed
import BadComponent from './BadComponent';

const DynamicRemoteComponent = ({ componentName }) => {
  if (!componentName) {
    return null;
  }

  const componentKey = `remoteApp/${componentName.substring(2)}`;
  
  // The lazy function will now attempt to load the remote component
  const Component = lazy(() => loadRemote(componentKey));

  return (
    // ErrorBoundary catches the error if loadRemote fails
    <Suspense fallback={<div>Loading...</div>}>
      <ErrorBoundary fallback={BadComponent}>
        <Component />
      </ErrorBoundary>
    </Suspense>
  );
};

export default DynamicRemoteComponent;
