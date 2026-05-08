export async function pMap(items, mapper, { concurrency = 8 } = {}) {
  const results = new Array(items.length);
  let next = 0;

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
