// Explicit account ownership: never adopt an unowned legacy garage.
export function createAccountStorage(storage, prefix) {
  const key = id => {
    if (typeof id !== 'string' || !id) throw Error('Compte requis');
    return `${prefix}_account_${encodeURIComponent(id)}`;
  };
  return {
    async load(id) {
      const raw = await storage.getItem(key(id));
      if (!raw) return null;
      const player = JSON.parse(raw);
      return player.accountId === id ? player : null;
    },
    async save(player) {
      await storage.setItem(key(player.accountId), JSON.stringify(player));
    },
    async remove(id) { await storage.removeItem(key(id)); },
  };
}
