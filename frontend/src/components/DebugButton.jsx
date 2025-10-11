import React, { useState } from 'react';
import DebugModal from './DebugModal';
import './DebugButton.css';

const DebugButton = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleClick = () => {
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      <button 
        className="debug-button" 
        onClick={handleClick}
        title="Debug Mode (Ctrl+Shift+D)"
        aria-label="Open debug modal"
      >
        🛠️
      </button>
      
      {isModalOpen && (
        <DebugModal onClose={handleClose} />
      )}
    </>
  );
};

export default DebugButton;
