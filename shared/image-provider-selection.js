export function orderImageProviders(providers = []) {
  return (Array.isArray(providers) ? providers : [])
    .map((provider, index) => ({ provider, index }))
    .filter(({ provider }) => provider?.id)
    .sort((left, right) => {
      const leftOrder = Number.isFinite(Number(left.provider.sortOrder)) ? Number(left.provider.sortOrder) : left.index;
      const rightOrder = Number.isFinite(Number(right.provider.sortOrder)) ? Number(right.provider.sortOrder) : right.index;
      return leftOrder - rightOrder || left.index - right.index;
    })
    .map(({ provider }) => provider);
}

export function resolveImageProviderId(providers = [], requestedId = '') {
  const available = orderImageProviders(providers);
  const requested = String(requestedId || '').trim();
  if (requested && available.some((provider) => provider.id === requested)) return requested;
  return available.find((provider) => provider.isDefault)?.id || available[0]?.id || '';
}

export function resolveEcommerceProjectImageProviderId(providers = [], storedId = '') {
  // A saved choice stays explicit even when the channel is no longer available.
  return String(storedId || '').trim() || resolveImageProviderId(providers);
}
