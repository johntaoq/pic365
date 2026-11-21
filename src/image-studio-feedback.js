export function imageStudioFeedbackTone(tone) {
  return tone === 'status' || tone === 'warning' ? tone : 'error';
}

// Feedback severity is independent of generation status: a new submission can
// fail while previously generated images remain visible in a successful state.
export function imageStudioFeedbackState(previous, update) {
  const next = typeof update === 'function' ? update(previous) : update;
  const { feedbackTone, ...state } = next;
  const sameMessage = state.message === previous.message;
  return {
    ...state,
    messageTone: state.message
      ? imageStudioFeedbackTone(feedbackTone ?? (sameMessage ? previous.messageTone : 'error'))
      : 'status'
  };
}
