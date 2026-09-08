#!/usr/bin/env node
/* ========================================
   COMTECH SAÚDE — Setup da integração Kommo
   Roda uma vez (e sempre que quiser conferir).

   Uso:
     KOMMO_SUBDOMAIN=xxx KOMMO_TOKEN=yyy node scripts/kommo-setup.mjs
     ... node scripts/kommo-setup.mjs --test    (cria um lead de teste)
   ======================================== */

import { kommoConfig, kommoFetch, getLeadFields, findField } from '../api/_kommo.js';

const TEST = process.argv.includes('--test');

/* Campos que o /api/lead procura pelo nome quando não há code nativo */
const REQUIRED_FIELDS = [
  { name: 'Produto de interesse', type: 'text' },
  { name: 'Página do site', type: 'text' },
  { name: 'URL de origem', type: 'url' },
];

/* UTMs: o Kommo já cria estes campos por padrão (tipo tracking_data).
   Se algum não existir na conta, criamos como texto com o mesmo nome. */
const UTM_FIELDS = [
  { code: 'UTM_SOURCE', name: 'utm_source' },
  { code: 'UTM_MEDIUM', name: 'utm_medium' },
  { code: 'UTM_CAMPAIGN', name: 'utm_campaign' },
  { code: 'UTM_TERM', name: 'utm_term' },
  { code: 'UTM_CONTENT', name: 'utm_content' },
  { code: 'GCLID', name: 'gclid' },
];

const log = (...args) => console.log(...args);

async function main() {
  const cfg = kommoConfig();
  log(`\n▶ Conta: ${cfg.subdomain}.kommo.com`);

  const account = await kommoFetch(cfg, '/account');
  log(`  Autenticado em "${account.name}" (id ${account.id})\n`);

  /* ---- Funis e etapas ---- */
  const pipelines = await kommoFetch(cfg, '/leads/pipelines');
  log('▶ Funis e etapas (use os IDs nas variáveis KOMMO_PIPELINE_ID / KOMMO_STATUS_ID):');
  for (const p of pipelines._embedded.pipelines) {
    log(`  Funil ${p.id} — ${p.name}${p.is_main ? ' (principal)' : ''}`);
    for (const s of p._embedded.statuses) {
      log(`      etapa ${s.id} — ${s.name}`);
    }
  }

  /* ---- Campos personalizados ---- */
  let fields = await getLeadFields(cfg, { force: true });
  log(`\n▶ Campos personalizados de lead existentes: ${fields.length}`);

  const missing = [];

  for (const spec of REQUIRED_FIELDS) {
    if (findField(fields, spec)) log(`  ✓ "${spec.name}" já existe`);
    else missing.push({ name: spec.name, type: spec.type });
  }

  for (const spec of UTM_FIELDS) {
    const found = findField(fields, spec);
    if (found) log(`  ✓ "${spec.name}" já existe (code ${found.code || '—'}, tipo ${found.type})`);
    else missing.push({ name: spec.name, type: 'text' });
  }

  if (missing.length) {
    log(`\n▶ Criando ${missing.length} campo(s): ${missing.map((f) => f.name).join(', ')}`);
    await kommoFetch(cfg, '/leads/custom_fields', {
      method: 'POST',
      body: JSON.stringify(missing),
    });
    fields = await getLeadFields(cfg, { force: true });
    log('  Campos criados.');
  } else {
    log('\n▶ Nenhum campo faltando.');
  }

  /* ---- Lead de teste ---- */
  if (TEST) {
    log('\n▶ Criando lead de teste…');
    const cf = (spec, value) => {
      const f = findField(fields, spec);
      return f ? [{ field_id: f.id, values: [{ value }] }] : [];
    };
    const lead = {
      name: 'TESTE — integração do site (pode apagar)',
      _embedded: {
        contacts: [{
          first_name: 'Teste Integração',
          custom_fields_values: [
            { field_code: 'PHONE', values: [{ value: '+5562999999999', enum_code: 'WORK' }] },
            { field_code: 'EMAIL', values: [{ value: 'teste@comtechsaude.com.br', enum_code: 'WORK' }] },
          ],
        }],
        tags: [{ name: 'Site' }],
      },
      custom_fields_values: [
        ...cf({ name: 'Produto de interesse' }, 'Papel grau cirúrgico'),
        ...cf({ name: 'Página do site' }, '/papel-grau-cirurgico.html'),
        ...cf({ code: 'UTM_SOURCE', name: 'utm_source' }, 'google'),
        ...cf({ code: 'UTM_MEDIUM', name: 'utm_medium' }, 'cpc'),
        ...cf({ code: 'UTM_CAMPAIGN', name: 'utm_campaign' }, 'teste-setup'),
        ...cf({ code: 'GCLID', name: 'gclid' }, 'TESTE-GCLID-123'),
      ],
    };
    if (cfg.pipelineId) lead.pipeline_id = cfg.pipelineId;
    if (cfg.statusId) lead.status_id = cfg.statusId;

    const created = await kommoFetch(cfg, '/leads/complex', {
      method: 'POST', body: JSON.stringify([lead]),
    });
    const id = Array.isArray(created) ? created[0]?.id : created?.id;
    log(`  ✓ Lead ${id} criado — confira em https://${cfg.subdomain}.kommo.com/leads/detail/${id}`);
  }

  log('\n✅ Setup concluído.\n');
}

main().catch((err) => {
  console.error('\n❌ ' + err.message + '\n');
  process.exit(1);
});
