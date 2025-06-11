import React, { lazy, Suspense } from 'react';
import { loadRemote } from '@module-federation/enhanced/runtime';
import ErrorBoundary from './ErrorBoundary'; // Adjust the import path as needed
import BadComponent from './BadComponent';

const componentCache = new Map();

const DynamicRemoteComponent = ({ componentName }) => {
  if (!componentName) {
    return null;
  }

  const componentKey = `remoteApp/${componentName.substring(2)}`;
  if (!componentCache.has(componentKey)) {
    componentCache.set(componentKey, lazy(() => loadRemote(componentKey)));
  }

  const Component = componentCache.get(componentKey);

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
