/**
 * COMTECH SAÚDE — Conversões offline do Google Ads
 *
 * Cole este código em uma planilha NOVA (Extensões → Apps Script), publique
 * como App da Web ("Executar como: eu", "Quem tem acesso: qualquer pessoa")
 * e mande a URL /exec para configurar em CONVERSIONS_ENDPOINT na Vercel.
 *
 * Cria duas abas:
 *   "Conversões offline" — só as colunas que o Google Ads importa (com gclid)
 *   "Log"               — todo evento recebido, inclusive sem gclid, para conferência
 */

// Opcional: se preencher, o endpoint só aceita chamadas com ?key=<esse valor>
var CHAVE = '';

var ABA_GOOGLE = 'Conversões offline';
var ABA_LOG = 'Log';

var COLUNAS_GOOGLE = [
  'Google Click ID',
  'Conversion Name',
  'Conversion Time',
  'Conversion Value',
  'Conversion Currency',
];

var COLUNAS_LOG = [
  'Recebido em', 'Conversão', 'Lead', 'Nome do lead', 'Produto',
  'gclid', 'E-mail', 'Telefone', 'Valor', 'utm_source', 'utm_campaign', 'Enviado ao Google',
];

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};

    if (CHAVE && p.key !== CHAVE) {
      return json({ ok: false, erro: 'chave inválida' });
    }

    var temGclid = !!(p.gclid && String(p.gclid).trim());

    aba(ABA_LOG, COLUNAS_LOG).appendRow([
      new Date(), p.conversao || '', p.lead_id || '', p.lead_nome || '', p.produto || '',
      p.gclid || '', p.email || '', p.telefone || '', p.valor || '',
      p.utm_source || '', p.utm_campaign || '', temGclid ? 'sim' : 'não (sem gclid)',
    ]);

    if (temGclid) {
      aba(ABA_GOOGLE, COLUNAS_GOOGLE).appendRow([
        String(p.gclid).trim(),
        p.conversao || '',
        p.data || '',
        p.valor || '',
        p.moeda || '',
      ]);
    }

    return json({ ok: true, google: temGclid });
  } catch (err) {
    return json({ ok: false, erro: String(err) });
  }
}

function doGet() {
  return json({ ok: true, servico: 'conversoes-offline-comtech' });
}

/** Devolve a aba, criando com cabeçalho na primeira vez. */
function aba(nome, colunas) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(nome);
  if (!sheet) {
    sheet = ss.insertSheet(nome);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(colunas);
    sheet.getRange(1, 1, 1, colunas.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
