import React from 'react';
import './Button.css';

const Button = ({ styleType = 'primary', children, ...props }) => {
  const className = `button ${styleType}`;
  return (
    <button className={className} {...props}>
      {children}
    </button>
  );
};

export default Button;