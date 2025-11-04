import React from 'react';

const Button = ({ children, onClick, disabled, type = 'button', className = '', ...props }) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
