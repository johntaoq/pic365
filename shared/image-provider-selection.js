export function orderImageProviders(providers = []) {
  return (Array.isArray(providers) ? providers : [])
    .map((provider, index) => ({ provider, index }))
    .filter(({ provider }) => provider?.id)
    .sort((left, right) => {
      const defaultOrder = Number(Boolean(right.provider.isDefault)) - Number(Boolean(left.provider.isDefault));
      return defaultOrder || left.index - right.index;
    })
    .map(({ provider }) => provider);
}

export function resolveImageProviderId(providers = [], requestedId = '') {
  const available = orderImageProviders(providers);
  const requested = String(requestedId || '').trim();
  if (requested && available.some((provider) => provider.id === requested)) return requested;
  return available[0]?.id || '';
}
