import { useState, useEffect } from 'react';

const getViewportHeight = () => {
  return window.innerHeight;
};

export const useViewportHeight = () => {
  const [viewportHeight, setViewportHeight] = useState(getViewportHeight());

  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(getViewportHeight());
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return viewportHeight;
};