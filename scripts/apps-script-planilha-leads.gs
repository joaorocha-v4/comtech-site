/**
 * COMTECH SAÚDE — Receptor de leads do site + conversões offline do Google Ads
 *
 * Cópia do que está publicado no Apps Script da planilha
 * "[Comtech Saude] Leads Forms Site" (Drive da V4 Company).
 * Para editar: abra a planilha -> Extensões -> Apps Script -> Implantar ->
 * Gerenciar implantações -> lápis -> Nova versão (mantém a mesma URL).
 *
 * Abas:
 *   Página1             — leads do formulário do site
 *   Conversões offline  — o que o Google Ads importa (só quem tem gclid)
 *   Log conversões      — todo evento recebido do Kommo, com ou sem gclid
 */

var SHEET_ID = '1dq6aV1AwG8uQT60eWCHn3wxJVPgsDRkwgz7d5G2MBtI';

var HEADERS = [
  'Data/Hora', 'Nome', 'E-mail', 'WhatsApp', 'Instituição',
  'Produto de interesse', 'Página', 'utm_source', 'utm_medium',
  'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'URL completa', 'Mensagem'
];

var ABA_CONVERSOES = 'Conversões offline';
var ABA_LOG = 'Log conversões';

var COLUNAS_CONVERSOES = [
  'Google Click ID', 'Conversion Name', 'Conversion Time',
  'Conversion Value', 'Conversion Currency'
];

var COLUNAS_LOG = [
  'Recebido em', 'Conversão', 'Lead', 'Nome do lead', 'Produto',
  'gclid', 'E-mail', 'Telefone', 'Valor', 'utm_source', 'utm_campaign',
  'Foi para o Google'
];

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};
    return p.tipo === 'conversao' ? gravarConversao(p) : gravarLead(p);
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json({ ok: true, servico: 'comtech-leads-e-conversoes' });
}

/* ---------- Leads do formulário do site ---------- */

function gravarLead(p) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheets()[0];

  // garante o cabeçalho (auto-corrige se a planilha estiver vazia/incompleta)
  var firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (String(firstRow[0]).trim() !== 'Data/Hora') {
    sheet.insertRowBefore(1);
  }
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');

  sheet.appendRow([
    Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss'),
    p.nome || '',
    p.email || '',
    p.whatsapp || '',
    p.instituicao || '',
    p.produto || '',
    p.pagina || '',
    p.utm_source || '',
    p.utm_medium || '',
    p.utm_campaign || '',
    p.utm_term || '',
    p.utm_content || '',
    p.gclid || '',
    p.url || '',
    p.mensagem || ''
  ]);

  return json({ ok: true });
}

/* ---------- Conversões offline (Kommo -> Google Ads) ---------- */

function gravarConversao(p) {
  var temGclid = !!(p.gclid && String(p.gclid).trim());
  var log = aba(ABA_LOG, COLUNAS_LOG);

  // idempotência: se a mesma conversão do mesmo lead já foi registrada, ignora.
  // Protege contra reenvio quando a resposta demora e o chamador tenta de novo.
  if (jaRegistrada(log, p.lead_id, p.conversao)) {
    return json({ ok: true, duplicado: true });
  }

  log.appendRow([
    Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss'),
    p.conversao || '',
    p.lead_id || '',
    p.lead_nome || '',
    p.produto || '',
    p.gclid || '',
    p.email || '',
    p.telefone || '',
    p.valor || '',
    p.utm_source || '',
    p.utm_campaign || '',
    temGclid ? 'sim' : 'não (sem gclid)'
  ]);

  // só entra na aba que o Google importa quem veio de clique em anúncio
  if (temGclid) {
    aba(ABA_CONVERSOES, COLUNAS_CONVERSOES).appendRow([
      String(p.gclid).trim(),
      p.conversao || '',
      p.data || '',
      p.valor || '',
      p.moeda || ''
    ]);
  }

  return json({ ok: true, google: temGclid });
}

/** Já existe essa conversão para esse lead no log? */
function jaRegistrada(log, leadId, conversao) {
  if (!leadId) return false;
  var ultima = log.getLastRow();
  if (ultima < 2) return false;
  var linhas = log.getRange(2, 2, ultima - 1, 2).getValues(); // B = Conversão, C = Lead
  for (var i = 0; i < linhas.length; i++) {
    if (String(linhas[i][1]) === String(leadId) && String(linhas[i][0]) === String(conversao)) {
      return true;
    }
  }
  return false;
}

/** Devolve a aba pelo nome, criando no fim da planilha com cabeçalho. */
function aba(nome, colunas) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(nome);
  if (!sheet) {
    sheet = ss.insertSheet(nome, ss.getNumSheets());
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

// Teste rápido (executar 1x no editor para autorizar as permissões):
function testeManual() {
  doPost({ parameter: { nome: 'Teste manual', email: 'teste@teste.com', whatsapp: '(62) 90000-0000' } });
}

// Cria as abas de conversão sem precisar esperar o primeiro envio do Kommo:
function criarAbasDeConversao() {
  aba(ABA_CONVERSOES, COLUNAS_CONVERSOES);
  aba(ABA_LOG, COLUNAS_LOG);
}
