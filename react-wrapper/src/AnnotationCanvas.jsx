import React, { useRef, useEffect } from 'react';

const AnnotationCanvas = React.forwardRef((props, ref) => {
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
      isDrawing.current = true;
      const rect = canvas.getBoundingClientRect();
      lastPos.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handleMouseMove = (e) => {
      if (!isDrawing.current) return;
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

    // No cleanup needed as event listeners are added only once
  }, []); // Empty dependency array means this effect runs only once on mount

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
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
      }}
    />
  );
});

export default AnnotationCanvas;