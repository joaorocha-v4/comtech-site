#!/usr/bin/env node
/* ========================================
   COMTECH SAÚDE — Registra/lista/remove o webhook de mudança de etapa

   Uso:
     node --env-file=.env scripts/kommo-webhook-register.mjs            (lista)
     node --env-file=.env scripts/kommo-webhook-register.mjs --criar
     node --env-file=.env scripts/kommo-webhook-register.mjs --remover <id>
   ======================================== */

import { kommoConfig, kommoFetch } from '../api/_kommo.js';

const cfg = kommoConfig();
const args = process.argv.slice(2);
const destino = process.env.WEBHOOK_URL
  || `https://www.comtechsaude.com.br/api/kommo-webhook?key=${process.env.WEBHOOK_SECRET || ''}`;

async function listar() {
  const r = await kommoFetch(cfg, '/webhooks');
  const hooks = r?._embedded?.webhooks || [];
  if (!hooks.length) return console.log('Nenhum webhook cadastrado.');
  for (const h of hooks) {
    console.log(`  #${h.id} → ${h.destination}`);
    console.log(`     eventos: ${(h.settings || []).join(', ')} | desativado: ${h.disabled ? 'sim' : 'não'}`);
  }
}

async function criar() {
  console.log('Registrando webhook em:', destino.replace(/key=[^&]*/, 'key=***'));

  // A API já usou dois formatos; tenta o atual e cai para o antigo se preciso.
  const tentativas = [
    { destination: destino, settings: ['status_lead'] },
    { url: destino, events: ['leads.status'] },
  ];

  for (const body of tentativas) {
    try {
      const r = await kommoFetch(cfg, '/webhooks', { method: 'POST', body: JSON.stringify(body) });
      console.log('✓ Webhook criado:', JSON.stringify(r).slice(0, 400));
      return;
    } catch (e) {
      console.log(`  formato ${Object.keys(body).join('/')} recusado (${e.status}): ${e.message.slice(0, 200)}`);
    }
  }
  throw new Error('Nenhum formato aceito — ver mensagens acima.');
}

async function remover(id) {
  await kommoFetch(cfg, '/webhooks', {
    method: 'DELETE',
    body: JSON.stringify([{ id: Number(id) }]),
  });
  console.log('✓ Webhook', id, 'removido.');
}

const acao = args.includes('--criar') ? criar
  : args.includes('--remover') ? () => remover(args[args.indexOf('--remover') + 1])
  : listar;

acao().then(listar.bind(null)).catch((e) => {
  console.error('\n❌ ' + e.message + '\n');
  process.exit(1);
});
