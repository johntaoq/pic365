export const SHARED_REFERENCE_PROTOCOL_VERSION = 1;

// Shared references are expanded before validation and persistence, so queued
// tasks and retries remain self-contained without repeating uploads on the wire.
export function expandSharedTaskReferences(tasks, sharedReferences) {
  if (sharedReferences === undefined) return tasks;
  if (!Array.isArray(sharedReferences) || sharedReferences.length > 9) {
    throw Object.assign(new Error('INVALID_REFERENCE_IMAGES'), { code: 'INVALID_REFERENCE_IMAGES' });
  }
  return tasks.map((task) => {
    if (task.references !== undefined && !Array.isArray(task.references)) {
      throw Object.assign(new Error('INVALID_REFERENCE_IMAGES'), { code: 'INVALID_REFERENCE_IMAGES' });
    }
    const references = [...sharedReferences, ...(task.references || [])];
    if (references.length > 9) {
      throw Object.assign(new Error('TOO_MANY_REFERENCE_IMAGES'), { code: 'TOO_MANY_REFERENCE_IMAGES' });
    }
    return { ...task, references };
  });
}
