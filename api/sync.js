let memoryStore = {
  presenceMap: {},
  partners: [],
  vaultPackages: []
};

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.result ? JSON.parse(data.result) : null;
  } catch (_e) {
    return null;
  }
}

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;

  try {
    const res = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(JSON.stringify(value))
    });
    return res.ok;
  } catch (_e) {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const persisted = await kvGet('seiya_studio_shared_state');
  const state = persisted || memoryStore;
  const now = Date.now();

  if (req.method === 'POST') {
    const { presence, partners, vaultPackages } = req.body || {};

    if (presence && presence.id) {
      state.presenceMap[presence.id] = {
        ...presence,
        ts: now
      };
    }

    if (Array.isArray(partners) && partners.length > 0) {
      const pMap = new Map();
      (state.partners || []).forEach(p => pMap.set(p.id, p));
      partners.forEach(p => {
        const prev = pMap.get(p.id);
        if (!prev) {
          pMap.set(p.id, p);
        } else {
          pMap.set(p.id, {
            ...prev,
            ...p,
            verified: prev.verified || p.verified,
            closedByExecutive: prev.closedByExecutive || p.closedByExecutive,
            lastActiveAt: Math.max(prev.lastActiveAt || 0, p.lastActiveAt || 0),
            totalUsageSeconds: Math.max(prev.totalUsageSeconds || 0, p.totalUsageSeconds || 0)
          });
        }
      });
      state.partners = Array.from(pMap.values()).slice(0, 50);
    }

    if (Array.isArray(vaultPackages) && vaultPackages.length > 0) {
      const vMap = new Map();
      (state.vaultPackages || []).forEach(v => vMap.set(v.id, v));
      vaultPackages.forEach(v => {
        if (!vMap.has(v.id)) vMap.set(v.id, v);
      });
      state.vaultPackages = Array.from(vMap.values()).slice(0, 60);
    }
  }

  Object.keys(state.presenceMap || {}).forEach(uid => {
    if (now - (state.presenceMap[uid]?.ts || 0) > 25000) {
      delete state.presenceMap[uid];
    }
  });

  memoryStore = state;
  await kvSet('seiya_studio_shared_state', state);

  return res.status(200).json(state);
}
