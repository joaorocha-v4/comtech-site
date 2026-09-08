/* ========================================
   COMTECH SAÚDE — Cliente da API do Kommo
   Compartilhado por /api/lead e scripts/kommo-setup.mjs
   ======================================== */

const API_VERSION = 'v4';

export function kommoConfig(env = process.env) {
  const subdomain = (env.KOMMO_SUBDOMAIN || '').trim().replace(/\.kommo\.com$/i, '');
  const token = (env.KOMMO_TOKEN || '').trim();
  if (!subdomain || !token) {
    throw new Error('KOMMO_SUBDOMAIN e KOMMO_TOKEN precisam estar definidos nas variáveis de ambiente.');
  }
  return {
    subdomain,
    token,
    baseUrl: `https://${subdomain}.kommo.com/api/${API_VERSION}`,
    pipelineId: env.KOMMO_PIPELINE_ID ? Number(env.KOMMO_PIPELINE_ID) : null,
    statusId: env.KOMMO_STATUS_ID ? Number(env.KOMMO_STATUS_ID) : null,
    responsibleUserId: env.KOMMO_RESPONSIBLE_USER_ID ? Number(env.KOMMO_RESPONSIBLE_USER_ID) : null,
  };
}

export async function kommoFetch(cfg, path, options = {}) {
  const res = await fetch(cfg.baseUrl + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  // 204 = sem conteúdo (ex.: busca sem resultados)
  if (res.status === 204) return null;

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* resposta não-JSON */ }

  if (!res.ok) {
    const detail = json ? JSON.stringify(json) : text.slice(0, 500);
    const err = new Error(`Kommo ${res.status} em ${path}: ${detail}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

/* ---------- Campos personalizados do lead ---------- */

let fieldCache = null;
let fieldCacheAt = 0;
const FIELD_TTL_MS = 10 * 60 * 1000;

export async function getLeadFields(cfg, { force = false } = {}) {
  if (!force && fieldCache && Date.now() - fieldCacheAt < FIELD_TTL_MS) return fieldCache;

  const fields = [];
  let page = 1;
  while (page <= 10) {
    const data = await kommoFetch(cfg, `/leads/custom_fields?limit=250&page=${page}`);
    const batch = data?._embedded?.custom_fields || [];
    fields.push(...batch);
    if (batch.length < 250) break;
    page += 1;
  }

  fieldCache = fields;
  fieldCacheAt = Date.now();
  return fields;
}

export function normalize(str) {
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
}

/** Acha um campo por code (prioridade) ou por nome, ignorando acento/caixa. */
export function findField(fields, { code, name }) {
  if (code) {
    const byCode = fields.find((f) => String(f.code || '').toUpperCase() === code.toUpperCase());
    if (byCode) return byCode;
  }
  if (name) {
    const target = normalize(name);
    const byName = fields.find((f) => normalize(f.name) === target);
    if (byName) return byName;
  }
  return null;
}

/* ---------- Utilitários de formatação ---------- */

/** Normaliza telefone brasileiro para o formato +55DDDNÚMERO. */
export function formatPhoneBR(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return '+' + digits;
  if (digits.length === 10 || digits.length === 11) return '+55' + digits;
  return '+' + digits;
}

export function clamp(value, max) {
  const str = String(value == null ? '' : value).trim();
  return str.length > max ? str.slice(0, max) : str;
}
