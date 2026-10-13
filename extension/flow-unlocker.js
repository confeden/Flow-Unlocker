(() => {
  'use strict';
  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const RPCS = ['cPZSdc', 'KV2T2d', 'rThb8d', 'cO7JOb', 'md9xJf'];

  function patchRpcJson(text, id) {
    try {
      const value = JSON.parse(text);
      if (!Array.isArray(value)) return text;
      if (id === 'cPZSdc') {
        while (value.length < 32) value.push(null);
        value[30] = 1;
        value[31] = 1;
      } else if (RPCS.includes(id)) {
        if (value.length) value[0] = 1;
        else value.push(1);
      }
      return JSON.stringify(value);
    } catch { return text; }
  }

  function patchStream(raw) {
    if (typeof raw !== 'string' || !RPCS.some(id => raw.includes(id))) return raw;
    let start = raw.indexOf(")]}'\n\n");
    let prefix = '';
    if (start >= 0) { start += 6; prefix = raw.slice(0, start); }
    else {
      start = raw.indexOf('\n\n');
      if (start >= 0) { start += 2; prefix = raw.slice(0, start); }
      else start = 0;
    }
    const body = raw.slice(start);
    try {
      const data = JSON.parse(body);
      if (Array.isArray(data)) {
        let changed = false;
        for (const item of data) {
          if (Array.isArray(item) && RPCS.includes(item[1]) && typeof item[2] === 'string') {
            item[2] = patchRpcJson(item[2], item[1]); changed = true;
          }
        }
        if (changed) return prefix + JSON.stringify(data);
      }
    } catch {}

    let output = prefix, pos = start, changed = false;
    while (pos < raw.length) {
      const nl = raw.indexOf('\n', pos);
      if (nl < 0) { output += raw.slice(pos); break; }
      const sizeText = raw.slice(pos, nl), size = Number(sizeText);
      if (!Number.isFinite(size) || size < 1 || nl + size > raw.length) { output += raw.slice(pos); break; }
      const chunkWithNl = raw.slice(nl, nl + size);
      try {
        const chunk = JSON.parse(chunkWithNl.slice(1));
        let chunkChanged = false;
        for (const item of chunk) {
          if (Array.isArray(item) && RPCS.includes(item[1]) && typeof item[2] === 'string') {
            item[2] = patchRpcJson(item[2], item[1]); chunkChanged = changed = true;
          }
        }
        output += chunkChanged ? `${1 + JSON.stringify(chunk).length}\n${JSON.stringify(chunk)}` : sizeText + chunkWithNl;
      } catch { output += sizeText + chunkWithNl; }
      pos = nl + size;
    }
    return changed ? output : raw;
  }

  function patchJson(data) {
    if (!data || typeof data !== 'object') return data;
    if (Array.isArray(data)) return data.map(patchJson);
    for (const key of Object.keys(data)) {
      if (key === 'availabilityState') data[key] = 'AVAILABLE';
      else if (['isCountrySupported', 'is_country_supported', 'isAgeSupported', 'is_age_supported'].includes(key)) data[key] = true;
      else if (data[key] && typeof data[key] === 'object') data[key] = patchJson(data[key]);
    }
    return data;
  }

  try {
    let wiz = w.WIZ_global_data || {};
    const forceFlag = target => {
      target.awbSEf = true;
      return new Proxy(target, { set(obj, key, value) { obj[key] = value; obj.awbSEf = true; return true; } });
    };
    wiz = forceFlag(wiz);
    Object.defineProperty(w, 'WIZ_global_data', {
      configurable: true, enumerable: true, get: () => wiz,
      set(value) { if (value && typeof value === 'object') wiz = forceFlag(value); }
    });
  } catch {}

  try {
    const proto = w.XMLHttpRequest?.prototype;
    for (const key of ['responseText', 'response']) {
      const desc = proto && Object.getOwnPropertyDescriptor(proto, key);
      if (!desc?.get) continue;
      Object.defineProperty(proto, key, {
        configurable: true,
        get() {
          const value = desc.get.call(this);
          if (this.responseType && this.responseType !== 'text' && !(key === 'response' && this.responseType === '')) return value;
          return typeof value === 'string' ? patchStream(value) : value;
        }
      });
    }
  } catch {}

  try {
    const originalFetch = w.fetch;
    w.fetch = async function(...args) {
      const request = args[0];
      const url = typeof request === 'string' ? request : request?.url || '';
      const response = await originalFetch.apply(this, args);
      if (url.includes('batchexecute')) {
        try {
          const headers = new Headers(response.headers); headers.delete('content-length');
          return new Response(patchStream(await response.text()), { status: response.status, statusText: response.statusText, headers });
        } catch { return response; }
      }
      if (['fetchToolAvailability', 'checkAppAvailability', 'trpc/general.'].some(part => url.includes(part))) {
        try {
          const text = await response.text(), headers = new Headers(response.headers); headers.delete('content-length');
          try {
            return new Response(JSON.stringify(patchJson(JSON.parse(text))), { status: 200, headers });
          } catch { return new Response(text, { status: response.status, statusText: response.statusText, headers }); }
        } catch { return response; }
      }
      return response;
    };
  } catch {}
})();

