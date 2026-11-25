let memoryStore = {
  presenceMap: {},
  partners: [],
  vaultPackages: []
};

function getKvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || typeof url !== 'string' || typeof token !== 'string') {
    return null;
  }
  const cleanUrl = url.trim().replace(/\/+$/, '');
  const cleanToken = token.trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    return null;
  }
  return { url: cleanUrl, token: cleanToken };
}

async function kvGet(key) {
  const cfg = getKvConfig();
  if (!cfg) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${cfg.url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && typeof data.result === 'string' && data.result.length > 0) {
      return JSON.parse(data.result);
    }
    return null;
  } catch (_e) {
    return null;
  }
}

async function kvSet(key, value) {
  const cfg = getKvConfig();
  if (!cfg) return false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${cfg.url}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(JSON.stringify(value)),
      signal: controller.signal
    });
    clearTimeout(timer);
    return res.ok;
  } catch (_e) {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const persisted = await kvGet('seiya_studio_shared_state');
    const baseState = persisted && typeof persisted === 'object' ? persisted : memoryStore;
    const state = {
      presenceMap: { ...(baseState.presenceMap || {}) },
      partners: Array.isArray(baseState.partners) ? [...baseState.partners] : [],
      vaultPackages: Array.isArray(baseState.vaultPackages) ? [...baseState.vaultPackages] : []
    };

    const now = Date.now();

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (_e) {
          body = {};
        }
      }
      body = body && typeof body === 'object' ? body : {};
      const { presence, partners, vaultPackages } = body;

      if (presence && typeof presence === 'object' && presence.id) {
        state.presenceMap[String(presence.id)] = {
          ...presence,
          id: String(presence.id),
          ts: now
        };
      }

      if (Array.isArray(partners) && partners.length > 0) {
        const pMap = new Map();
        state.partners.forEach(p => {
          if (p && p.id) pMap.set(p.id, p);
        });
        partners.forEach(p => {
          if (!p || !p.id) return;
          const prev = pMap.get(p.id);
          if (!prev) {
            pMap.set(p.id, p);
          } else {
            pMap.set(p.id, {
              ...prev,
              ...p,
              verified: Boolean(prev.verified || p.verified),
              closedByExecutive: Boolean(prev.closedByExecutive || p.closedByExecutive),
              lastActiveAt: Math.max(Number(prev.lastActiveAt || 0), Number(p.lastActiveAt || 0)),
              totalUsageSeconds: Math.max(Number(prev.totalUsageSeconds || 0), Number(p.totalUsageSeconds || 0))
            });
          }
        });
        state.partners = Array.from(pMap.values()).slice(0, 50);
      }

      if (Array.isArray(vaultPackages) && vaultPackages.length > 0) {
        const vMap = new Map();
        state.vaultPackages.forEach(v => {
          if (v && v.id) vMap.set(v.id, v);
        });
        vaultPackages.forEach(v => {
          if (v && v.id && !vMap.has(v.id)) {
            vMap.set(v.id, v);
          }
        });
        state.vaultPackages = Array.from(vMap.values()).slice(0, 60);
      }
    }

    Object.keys(state.presenceMap).forEach(uid => {
      const item = state.presenceMap[uid];
      if (!item || now - Number(item.ts || 0) > 25000) {
        delete state.presenceMap[uid];
      }
    });

    memoryStore = state;
    await kvSet('seiya_studio_shared_state', state);

    return res.status(200).json(state);
  } catch (err) {
    memoryStore = {
      presenceMap: memoryStore?.presenceMap || {},
      partners: memoryStore?.partners || [],
      vaultPackages: memoryStore?.vaultPackages || []
    };
    return res.status(200).json({
      ...memoryStore,
      degradedMode: true,
      note: err?.message || 'Fallback memory mode active'
    });
  }
}
