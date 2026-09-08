/* ========================================
   COMTECH SAÚDE — Webhook do Kommo → conversões offline do Google Ads

   O Kommo chama este endpoint quando um lead muda de etapa.
   Quando a etapa é uma das mapeadas abaixo, gravamos uma linha na aba
   "Conversões offline" da planilha, que o Google Ads lê pelo Data Manager.

   Idempotência: ao enviar, marcamos o lead com uma tag. Se a tag já existe,
   não enviamos de novo (evita contar a mesma venda duas vezes se o lead
   voltar e avançar de etapa).

   Variáveis de ambiente adicionais:
     WEBHOOK_SECRET          chave que o Kommo manda em ?key=
     CONVERSIONS_ENDPOINT    Apps Script que grava na aba de conversões
     KOMMO_STATUS_QUALIFICADO  id da etapa "Proposta"        (padrão 109867911)
     KOMMO_STATUS_VENDA        id da etapa "Fechado - ganho" (padrão 142)
   ======================================== */

import { waitUntil } from '@vercel/functions';
import { kommoConfig, kommoFetch, getLeadFields, findField, clamp } from './_kommo.js';

const TIMEZONE_OFFSET = '-03:00'; // America/Sao_Paulo

function conversionMap() {
  return {
    [process.env.KOMMO_STATUS_QUALIFICADO || '109867911']: {
      nome: 'Lead qualificado CRM',
      tag: 'ads-qualificado',
      comValor: false,
    },
    [process.env.KOMMO_STATUS_VENDA || '142']: {
      nome: 'Venda CRM',
      tag: 'ads-venda',
      comValor: true,
    },
  };
}

/** Extrai [{id, status_id, old_status_id}] do corpo do Kommo.
    Aceita as duas formas: form-encoded (leads[status][0][id]) e JSON aninhado. */
function parseStatusEvents(req) {
  const body = req.body;

  // JSON já desserializado pela Vercel
  if (body && typeof body === 'object' && body.leads?.status) {
    return [].concat(body.leads.status);
  }

  let entries;
  if (typeof body === 'string') {
    const t = body.trim();
    if (t.startsWith('{')) {
      try { return [].concat(JSON.parse(t)?.leads?.status || []); } catch (e) { /* segue form-encoded */ }
    }
    entries = [...new URLSearchParams(t).entries()];
  } else if (body && typeof body === 'object') {
    entries = Object.entries(body);
  } else {
    return [];
  }

  const byIndex = {};
  for (const [key, value] of entries) {
    const m = /^leads\[status\]\[(\d+)\]\[([a-z_]+)\]$/.exec(key);
    if (!m) continue;
    (byIndex[m[1]] ||= {})[m[2]] = value;
  }
  return Object.values(byIndex);
}

/** Data no formato aceito pelo Google Ads: 2026-09-08T09:58:14-03:00 */
function googleTimestamp(date = new Date()) {
  const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return local.toISOString().replace(/\.\d{3}Z$/, '') + TIMEZONE_OFFSET;
}

function fieldValue(lead, fields, spec) {
  const def = findField(fields, spec);
  if (!def) return '';
  const hit = (lead.custom_fields_values || []).find((f) => f.field_id === def.id);
  return hit?.values?.[0]?.value || '';
}

function contactValue(contact, code) {
  const hit = (contact?.custom_fields_values || []).find((f) => f.field_code === code);
  return hit?.values?.[0]?.value || '';
}

async function enviarConversao(row) {
  const endpoint = process.env.CONVERSIONS_ENDPOINT;
  if (!endpoint) throw new Error('CONVERSIONS_ENDPOINT não configurado');

  const body = new URLSearchParams({ tipo: 'conversao', ...row }).toString();

  // O Apps Script serializa execuções do mesmo script: se dois leads mudarem de
  // etapa juntos, o segundo espera o primeiro. Daí o timeout folgado + 1 retentativa.
  let ultimoErro;
  for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
        signal: AbortSignal.timeout(tentativa === 1 ? 20000 : 8000),
      });
      if (!res.ok) throw new Error('planilha respondeu ' + res.status);
      return;
    } catch (e) {
      ultimoErro = e;
      console.warn(`[webhook] planilha falhou (tentativa ${tentativa}):`, e.message);
    }
  }
  throw ultimoErro;
}

async function processarLead(cfg, leadId, statusId) {
  const regra = conversionMap()[String(statusId)];
  if (!regra) return { leadId, acao: 'etapa ignorada' };

  const lead = await kommoFetch(cfg, `/leads/${leadId}?with=contacts`);
  if (!lead) return { leadId, acao: 'lead não encontrado (apagado?)' };

  const jaEnviado = (lead._embedded?.tags || []).some((t) => t.name === regra.tag);
  if (jaEnviado) return { leadId, acao: 'já enviado antes', conversao: regra.nome };

  const fields = await getLeadFields(cfg);
  const gclid = fieldValue(lead, fields, { code: 'GCLID', name: 'gclid' });

  let email = '';
  let telefone = '';
  const contactId = lead._embedded?.contacts?.[0]?.id;
  if (contactId) {
    const contato = await kommoFetch(cfg, `/contacts/${contactId}`);
    email = contactValue(contato, 'EMAIL');
    telefone = contactValue(contato, 'PHONE');
  }

  await enviarConversao({
    conversao: regra.nome,
    gclid,
    data: googleTimestamp(),
    valor: regra.comValor ? String(lead.price || 0) : '',
    moeda: regra.comValor ? 'BRL' : '',
    email,
    telefone,
    lead_id: String(lead.id),
    lead_nome: clamp(lead.name, 200),
    produto: fieldValue(lead, fields, { name: 'Produto de interesse' }),
    utm_source: fieldValue(lead, fields, { code: 'UTM_SOURCE', name: 'utm_source' }),
    utm_campaign: fieldValue(lead, fields, { code: 'UTM_CAMPAIGN', name: 'utm_campaign' }),
  });

  // marca o lead para não enviar de novo
  const tags = [...(lead._embedded?.tags || []).map((t) => ({ id: t.id })), { name: regra.tag }];
  await kommoFetch(cfg, '/leads', {
    method: 'PATCH',
    body: JSON.stringify([{ id: lead.id, _embedded: { tags } }]),
    signal: AbortSignal.timeout(8000),
  });

  // sem gclid o lead não veio de clique em anúncio: a planilha guarda no log,
  // mas ele não entra na aba que o Google Ads importa
  return {
    leadId,
    acao: gclid ? 'enviado ao Google' : 'registrado no log (sem gclid)',
    conversao: regra.nome,
    valor: lead.price || 0,
  };
}

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('method not allowed');

  const segredo = process.env.WEBHOOK_SECRET;
  if (segredo && req.query?.key !== segredo) {
    console.warn('[webhook] chave inválida');
    return res.status(401).send('unauthorized');
  }

  const eventos = parseStatusEvents(req);
  if (!eventos.length) return res.status(200).send('sem eventos de etapa');

  // O Kommo espera resposta em 2s e desativa o webhook se der timeout demais,
  // então respondemos na hora e processamos em segundo plano.
  const trabalho = processarEventos(eventos);
  try {
    waitUntil(trabalho);
  } catch (e) {
    // fora do runtime da Vercel (teste local): só não deixa virar unhandled rejection
    trabalho.catch(() => {});
  }
  return res.status(200).json({ ok: true, recebidos: eventos.length });
}

async function processarEventos(eventos) {
  const resultados = [];
  try {
    const cfg = kommoConfig();
    for (const ev of eventos) {
      if (!ev.id) continue;
      try {
        resultados.push(await processarLead(cfg, ev.id, ev.status_id));
      } catch (e) {
        console.error(`[webhook] lead ${ev.id}:`, e.message);
        resultados.push({ leadId: ev.id, acao: 'erro', erro: e.message });
      }
    }
  } catch (e) {
    console.error('[webhook] erro geral:', e.message);
  }
  console.log('[webhook]', JSON.stringify(resultados));
}
