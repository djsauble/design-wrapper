import React, { useRef, useEffect } from 'react';

const AnnotationCanvas = React.forwardRef(({ isVisible }, ref) => {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPos = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    // Set canvas size to match parent
    const parent = canvas.parentElement;
    canvas.width = parent.offsetWidth;
    canvas.height = parent.offsetHeight;

    context.lineWidth = 4;
    context.strokeStyle = 'red';
    context.lineCap = 'round';

    const handleMouseDown = (e) => {
      if (!isVisible) return; // Only draw if visible
      isDrawing.current = true;
      const rect = canvas.getBoundingClientRect();
      lastPos.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handleMouseMove = (e) => {
      if (!isDrawing.current || !isVisible) return; // Only draw if drawing and visible
      const rect = canvas.getBoundingClientRect();
      const currentPos = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      draw(lastPos.current, currentPos, context);
      lastPos.current = currentPos;
    };

    const handleMouseUp = () => {
      isDrawing.current = false;
      lastPos.current = null;
    };

    const handleMouseOut = () => {
      isDrawing.current = false;
      lastPos.current = null;
    };

    canvas.addEventListener('pointerdown', handleMouseDown);
    canvas.addEventListener('pointermove', handleMouseMove);
    canvas.addEventListener('pointerup', handleMouseUp);
    canvas.addEventListener('pointerout', handleMouseOut);

    // Cleanup event listeners on unmount
    return () => {
      canvas.removeEventListener('pointerdown', handleMouseDown);
      canvas.removeEventListener('pointermove', handleMouseMove);
      canvas.removeEventListener('pointerup', handleMouseUp);
      canvas.removeEventListener('pointerout', handleMouseOut);
    };
  }, [isVisible]); // Re-run effect if isVisible changes

  useEffect(() => {
    // Clear canvas when isVisible becomes false
    if (!isVisible) {
      clearCanvas();
    }
  }, [isVisible]); // Re-run effect if isVisible changes


  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) { // Add null check for canvas
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  React.useImperativeHandle(ref, () => ({
    clearCanvas
  }));

  const draw = (pos1, pos2, context) => {
    context.beginPath();
    context.moveTo(pos1.x, pos1.y);
    context.lineTo(pos2.x, pos2.y);
    context.stroke();
  };

  return (
    <canvas
      ref={canvasRef}
      style={{
        // Most styles are defined directly in App.css
        zIndex: 1, // Ensure canvas is above other content
        display: isVisible ? 'block' : 'none', // Hide/show based on isVisible
      }}
    />
  );
});

export default AnnotationCanvas;