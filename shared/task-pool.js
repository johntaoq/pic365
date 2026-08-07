export async function runTaskPool(items, concurrency, worker) {
  const queue = Array.isArray(items) ? items : [];
  if (!queue.length) return [];
  const workerCount = Math.min(Math.max(1, Number(concurrency) || 1), queue.length);
  const results = new Array(queue.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < queue.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(queue[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}
