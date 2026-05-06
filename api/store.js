// Upstash Redis REST API を使う場合: UPSTASH_REDIS_REST_URL と UPSTASH_REDIS_REST_TOKEN を設定
// 未設定の場合はインメモリ Map にフォールバック（MVP用）

const store = new Map();

async function redisCmd(...args) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const json = await res.json();
  return json.result ?? null;
}

const useRedis = () =>
  !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

async function get(key) {
  if (useRedis()) {
    const raw = await redisCmd('GET', key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return store.get(key) ?? null;
}

async function set(key, value) {
  if (useRedis()) {
    return redisCmd('SET', key, JSON.stringify(value));
  }
  store.set(key, value);
}

async function sadd(key, ...members) {
  if (useRedis()) {
    return redisCmd('SADD', key, ...members);
  }
  const s = store.get(key) instanceof Set ? store.get(key) : new Set();
  members.forEach(m => s.add(m));
  store.set(key, s);
}

async function smembers(key) {
  if (useRedis()) {
    const result = await redisCmd('SMEMBERS', key);
    return Array.isArray(result) ? result : [];
  }
  const s = store.get(key);
  return s instanceof Set ? Array.from(s) : [];
}

async function lpush(key, ...values) {
  if (useRedis()) {
    return redisCmd('LPUSH', key, ...values);
  }
  const arr = Array.isArray(store.get(key)) ? store.get(key) : [];
  arr.unshift(...values);
  store.set(key, arr);
}

async function ltrim(key, start, stop) {
  if (useRedis()) {
    return redisCmd('LTRIM', key, start, stop);
  }
  const arr = Array.isArray(store.get(key)) ? store.get(key) : [];
  store.set(key, arr.slice(start, stop + 1));
}

async function lrange(key, start, end) {
  if (useRedis()) {
    const result = await redisCmd('LRANGE', key, start, end);
    return Array.isArray(result) ? result : [];
  }
  const arr = Array.isArray(store.get(key)) ? store.get(key) : [];
  return arr.slice(start, end + 1);
}

async function del(key) {
  if (useRedis()) {
    return redisCmd('DEL', key);
  }
  store.delete(key);
}

module.exports = { get, set, sadd, smembers, lpush, ltrim, lrange, del };
