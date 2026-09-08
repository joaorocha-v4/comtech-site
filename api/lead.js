/* ========================================
   COMTECH SAÚDE — Endpoint de leads
   Recebe o formulário do site, cria o lead no Kommo
   e replica na planilha (Apps Script) como backup.

   Variáveis de ambiente (Vercel):
     KOMMO_SUBDOMAIN          ex.: comtechsaude
     KOMMO_TOKEN              token de longa duração (NUNCA no repositório)
     KOMMO_PIPELINE_ID        opcional — funil de destino
     KOMMO_STATUS_ID          opcional — etapa inicial
     KOMMO_RESPONSIBLE_USER_ID opcional — usuário responsável
     SHEETS_ENDPOINT          opcional — URL do Apps Script da planilha
     ALLOWED_ORIGINS          opcional — lista separada por vírgula
   ======================================== */

import {
  kommoConfig, kommoFetch, getLeadFields, findField, formatPhoneBR, clamp,
} from './_kommo.js';

const DEFAULT_ORIGINS = [
  'https://comtechsaude.com.br',
  'https://www.comtechsaude.com.br',
];

/* Campos do lead: usa o code nativo do Kommo quando existe (UTMs),
   senão procura pelo nome criado por scripts/kommo-setup.mjs. */
const LEAD_FIELDS = [
  { key: 'produto', name: 'Produto de interesse' },
  { key: 'pagina', name: 'Página do site' },
  { key: 'url', name: 'URL de origem' },
  { key: 'utm_source', code: 'UTM_SOURCE', name: 'utm_source' },
  { key: 'utm_medium', code: 'UTM_MEDIUM', name: 'utm_medium' },
  { key: 'utm_campaign', code: 'UTM_CAMPAIGN', name: 'utm_campaign' },
  { key: 'utm_term', code: 'UTM_TERM', name: 'utm_term' },
  { key: 'utm_content', code: 'UTM_CONTENT', name: 'utm_content' },
  { key: 'gclid', code: 'GCLID', name: 'gclid' },
];

function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (trimmed.startsWith('{')) {
      try { return JSON.parse(trimmed); } catch (e) { return {}; }
    }
    return Object.fromEntries(new URLSearchParams(trimmed));
  }
  return body && typeof body === 'object' ? body : {};
}

function allowedOrigins() {
  const extra = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

function applyCors(req, res) {
  const origin = req.headers.origin || '';
  const list = allowedOrigins();
  const ok = list.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  res.setHeader('Access-Control-Allow-Origin', ok ? origin : list[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function validate(data) {
  const errors = [];
  const nome = clamp(data.nome, 120);
  const email = clamp(data.email, 160).toLowerCase();
  const telefone = clamp(data.whatsapp || data.telefone, 40);

  if (nome.length < 2) errors.push('nome');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('email');
  if (String(telefone).replace(/\D/g, '').length < 10) errors.push('telefone');

  return { errors, nome, email, telefone };
}

function buildNote(data) {
  const linhas = [
    data.mensagem ? `Mensagem: ${data.mensagem}` : null,
    data.instituicao ? `Instituição: ${data.instituicao}` : null,
    data.produto ? `Produto: ${data.produto}` : null,
    data.url ? `Página: ${data.url}` : null,
    (data.utm_source || data.utm_medium || data.utm_campaign)
      ? `Campanha: ${data.utm_source || '-'} / ${data.utm_medium || '-'} / ${data.utm_campaign || '-'}`
      : null,
    data.utm_term ? `Termo: ${data.utm_term}` : null,
    data.utm_content ? `Anúncio: ${data.utm_content}` : null,
    data.gclid ? `gclid: ${data.gclid}` : null,
  ].filter(Boolean);
  return `Lead recebido pelo site\n\n${linhas.join('\n')}`;
}

async function buildCustomFields(cfg, data) {
  const fields = await getLeadFields(cfg);
  const values = [];
  for (const spec of LEAD_FIELDS) {
    const raw = clamp(data[spec.key], 500);
    if (!raw) continue;
    const field = findField(fields, spec);
    if (!field) continue;
    values.push({ field_id: field.id, values: [{ value: raw }] });
  }
  return values;
}

async function forwardToSheets(data) {
  const endpoint = process.env.SHEETS_ENDPOINT;
  if (!endpoint) return;
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams(data).toString(),
      signal: AbortSignal.timeout(12000),
    });
  } catch (e) {
    console.error('[lead] falha ao replicar na planilha:', e.message);
  }
}

// o Apps Script pode levar ~8s no cold start; a chamada roda em paralelo com o Kommo
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const data = parseBody(req);

  // honeypot: bots preenchem campos escondidos
  if (data.website || data.empresa_site) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const { errors, nome, email, telefone } = validate(data);
  if (errors.length) {
    return res.status(422).json({ ok: false, error: 'validation', fields: errors });
  }

  const produto = clamp(data.produto, 200) || 'Orçamento pelo site';
  const instituicao = clamp(data.instituicao || data.empresa, 200);

  // a planilha continua recebendo mesmo se o Kommo falhar
  const sheetsPromise = forwardToSheets(data);

  let leadId = null;
  let kommoError = null;

  try {
    const cfg = kommoConfig();
    const customFields = await buildCustomFields(cfg, { ...data, produto });

    const contact = {
      first_name: nome,
      custom_fields_values: [
        { field_code: 'PHONE', values: [{ value: formatPhoneBR(telefone), enum_code: 'WORK' }] },
        { field_code: 'EMAIL', values: [{ value: email, enum_code: 'WORK' }] },
      ],
    };

    const lead = {
      name: `${produto} — ${nome}`.slice(0, 250),
      request_id: `site-${Date.now()}`,
      _embedded: {
        contacts: [contact],
        tags: [{ name: 'Site' }],
      },
    };
    if (customFields.length) lead.custom_fields_values = customFields;
    if (instituicao) lead._embedded.companies = [{ name: instituicao }];
    if (cfg.pipelineId) lead.pipeline_id = cfg.pipelineId;
    if (cfg.statusId) lead.status_id = cfg.statusId;
    if (cfg.responsibleUserId) lead.responsible_user_id = cfg.responsibleUserId;

    const created = await kommoFetch(cfg, '/leads/complex', {
      method: 'POST',
      body: JSON.stringify([lead]),
      signal: AbortSignal.timeout(9000),
    });

    leadId = Array.isArray(created) ? created[0]?.id : created?.id;

    if (leadId) {
      try {
        await kommoFetch(cfg, `/leads/${leadId}/notes`, {
          method: 'POST',
          body: JSON.stringify([{ note_type: 'common', params: { text: buildNote({ ...data, produto, instituicao }) } }]),
          signal: AbortSignal.timeout(7000),
        });
      } catch (e) {
        console.error('[lead] nota não anexada:', e.message);
      }
    }
  } catch (e) {
    kommoError = e.message;
    console.error('[lead] falha ao criar lead no Kommo:', e.message);
  }

  await sheetsPromise;

  // o usuário nunca vê erro: o lead já está na planilha e o evento de conversão dispara
  return res.status(200).json({ ok: true, lead_id: leadId, crm: kommoError ? 'error' : 'ok' });
}
