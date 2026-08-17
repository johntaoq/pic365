export function resolveImageProviderId(providers = [], requestedId = '') {
  const available = Array.isArray(providers) ? providers.filter((provider) => provider?.id) : [];
  const requested = String(requestedId || '').trim();
  if (requested && available.some((provider) => provider.id === requested)) return requested;
  return available.find((provider) => provider.isDefault)?.id || available[0]?.id || '';
}
