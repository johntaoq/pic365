import React, { useCallback, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { imageStudioFeedbackTone } from './image-studio-feedback.js';

export function useImageStudioFeedback() {
  const [feedback, setFeedback] = useState({ message: '', tone: 'status' });
  const setMessage = useCallback((message, tone = 'error') => {
    setFeedback({ message, tone: message ? imageStudioFeedbackTone(tone) : 'status' });
  }, []);
  return [feedback, setMessage];
}

export default function ImageStudioFeedback({ children, tone = 'error', className = '' }) {
  if (!children) return null;
  const severity = imageStudioFeedbackTone(tone);
  return <p className={`imageStudioFeedback ${className}`} data-tone={severity}
    role={severity === 'error' ? 'alert' : 'status'} aria-atomic="true">
    {severity !== 'status' ? <CircleAlert size={14} aria-hidden="true" /> : null}
    <span>{children}</span>
  </p>;
}
