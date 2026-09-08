/* ========================================
   COMTECH SAÚDE — Formulário de Leads
   Modal de orçamento + captura de UTMs
   Envio para /api/lead (cria o lead no Kommo
   e replica na planilha do Google)
   ======================================== */

// Endpoint próprio (função serverless na Vercel) — cria o lead no Kommo
const LEAD_ENDPOINT = '/api/lead';

// Fallback: Apps Script da planilha, usado só se o endpoint próprio falhar
const FALLBACK_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxwqQwuOtq0IPh64vOpuQ1gEUjUp57UOfCuUmSL9mFCPPjX8WjLOr6NgyM_XRaB2YLg/exec';

const WHATSAPP_NUMBER = '5562992193758';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid'];
const STORAGE_KEY = 'comtech_utms';

/* ---------- Captura e persistência de UTMs ---------- */

function captureUtms() {
  let stored = {};
  try {
    stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) { /* sessionStorage indisponível */ }

  const params = new URLSearchParams(window.location.search);
  let hasNew = false;
  UTM_KEYS.forEach((key) => {
    const value = params.get(key);
    if (value) {
      stored[key] = value;
      hasNew = true;
    }
  });

  if (hasNew) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch (e) { /* noop */ }
  }
  return stored;
}

function fillHiddenFields(form, produto) {
  const utms = captureUtms();
  const set = (name, value) => {
    const field = form.querySelector('input[name="' + name + '"]');
    if (field) field.value = value || '';
  };
  set('produto', produto);
  set('pagina', window.location.pathname);
  set('url', window.location.href);
  set('utm_source', utms.utm_source);
  set('utm_medium', utms.utm_medium);
  set('utm_campaign', utms.utm_campaign);
  set('utm_term', utms.utm_term);
  set('utm_content', utms.utm_content);
  // gclid (Google Ads) — usa gbraid/wbraid como fallback (tráfego iOS)
  set('gclid', utms.gclid || utms.gbraid || utms.wbraid);
}

/* ---------- Envio ---------- */

function sendLead(data) {
  pushDataLayer('lead_form_submit', data);

  return fetch(LEAD_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify(data),
  })
    .then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json().catch(() => ({ ok: true }));
    })
    .catch((err) => {
      console.warn('[lead-form] /api/lead indisponível, enviando direto à planilha:', err);
      return sendLeadFallback(data);
    });
}

// Rede de segurança: grava na planilha mesmo se a função serverless estiver fora
function sendLeadFallback(data) {
  if (!FALLBACK_ENDPOINT) return Promise.resolve({ ok: false });
  return fetch(FALLBACK_ENDPOINT, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams(data).toString(),
  }).then(() => ({ ok: true, fallback: true }));
}

// Campo-isca invisível: bots preenchem, pessoas não. Descartado no servidor.
function addHoneypot(form) {
  if (form.querySelector('input[name="website"]')) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'website';
  input.tabIndex = -1;
  input.autocomplete = 'off';
  input.setAttribute('aria-hidden', 'true');
  input.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
  form.appendChild(input);
}

function pushDataLayer(event, data) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: event,
    lead_produto: data.produto || '',
    lead_pagina: data.pagina || '',
    lead_utm_source: data.utm_source || '',
    lead_utm_medium: data.utm_medium || '',
    lead_utm_campaign: data.utm_campaign || '',
  });
}

function collectFormData(form) {
  const data = {};
  new FormData(form).forEach((value, key) => { data[key] = String(value).trim(); });
  return data;
}

function validateLeadData(data, form) {
  let ok = true;
  const mark = (name, valid) => {
    const field = form.querySelector('[name="' + name + '"]');
    if (field) field.classList.toggle('form-error', !valid);
    if (!valid) ok = false;
  };
  mark('nome', !!data.nome && data.nome.length >= 2);
  mark('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || ''));
  const telField = data.whatsapp !== undefined ? 'whatsapp' : 'telefone';
  const tel = (data[telField] || '').replace(/\D/g, '');
  mark(telField, tel.length >= 10);
  return ok;
}

function whatsappHandoffUrl(produto) {
  const msg = 'Olá! Acabei de solicitar um orçamento pelo site' +
    (produto && produto.indexOf('Geral') !== 0 && produto !== 'Contato' ? ' sobre ' + produto : '') + '.';
  return 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(msg);
}

/* ---------- Modal ---------- */

function initLeadModal() {
  const overlay = document.getElementById('leadModalOverlay');
  if (!overlay) return;

  const modal = overlay.querySelector('.lead-modal');
  const produto = modal.getAttribute('data-produto') || document.title;
  const form = overlay.querySelector('#leadForm');
  addHoneypot(form);
  const closeBtn = overlay.querySelector('.lead-modal-close');
  const feedback = overlay.querySelector('.lead-form-feedback');
  const success = overlay.querySelector('.lead-success');
  const handoff = overlay.querySelector('.lead-wa-handoff');

  let lastFocused = null;

  function openModal() {
    lastFocused = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add('lead-modal-open');
    fillHiddenFields(form, produto);
    pushDataLayer('lead_modal_open', { produto: produto, pagina: window.location.pathname });
    const first = form.querySelector('input[name="nome"]');
    if (first) setTimeout(() => first.focus(), 60);
  }

  function closeModal() {
    overlay.hidden = true;
    document.body.classList.remove('lead-modal-open');
    if (lastFocused) lastFocused.focus();
  }

  document.querySelectorAll('[data-open-lead-modal]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });
  });

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) closeModal();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    fillHiddenFields(form, produto);
    const data = collectFormData(form);
    if (!validateLeadData(data, form)) {
      feedback.hidden = false;
      feedback.textContent = 'Confira os campos destacados e tente novamente.';
      return;
    }
    feedback.hidden = true;
    const btn = form.querySelector('.lead-submit');
    btn.disabled = true;
    btn.textContent = 'Enviando…';

    sendLead(data)
      .catch(() => { /* no-cors: sem leitura de resposta; segue fluxo */ })
      .finally(() => {
        form.hidden = true;
        success.hidden = false;
        if (handoff) handoff.href = whatsappHandoffUrl(produto);
        btn.disabled = false;
        btn.textContent = 'Enviar solicitação';
      });
  }, true);
}

/* ---------- Formulário da página de Contato ---------- */

function initContactForm() {
  const form = document.querySelector('form[data-validate]');
  if (!form || form.id === 'leadForm') return;

  addHoneypot(form);

  // acrescenta campos ocultos de rastreamento
  ['produto', 'pagina', 'url', 'utm_source', 'utm_medium', 'utm_campaign',
    'utm_term', 'utm_content', 'gclid'].forEach((name) => {
    if (!form.querySelector('input[name="' + name + '"]')) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      form.appendChild(input);
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();

    const interesse = form.querySelector('[name="interesse"]');
    const produto = interesse && interesse.selectedIndex > 0
      ? interesse.options[interesse.selectedIndex].text
      : 'Contato';
    fillHiddenFields(form, produto);

    const raw = collectFormData(form);
    if (!validateLeadData(raw, form)) return;

    // normaliza nomes de campos p/ planilha
    const data = {
      nome: raw.nome || '',
      email: raw.email || '',
      whatsapp: raw.whatsapp || raw.telefone || '',
      instituicao: raw.instituicao || raw.empresa || '',
      produto: raw.produto || produto,
      pagina: raw.pagina || '',
      url: raw.url || '',
      utm_source: raw.utm_source || '',
      utm_medium: raw.utm_medium || '',
      utm_campaign: raw.utm_campaign || '',
      utm_term: raw.utm_term || '',
      utm_content: raw.utm_content || '',
      gclid: raw.gclid || '',
      mensagem: raw.mensagem || '',
    };

    const btn = form.querySelector('[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }

    sendLead(data)
      .catch(() => { /* no-cors */ })
      .finally(() => {
        const card = form.closest('.contact-form-card') || form.parentElement;
        card.innerHTML =
          '<div class="lead-success" style="display:block">' +
          '<i class="bi bi-check-circle"></i>' +
          '<h3 class="as-h4">Solicitação enviada!</h3>' +
          '<p>Recebemos seus dados e nossa equipe retornará o mais rápido possível.</p>' +
          '<a class="btn btn-whatsapp" target="_blank" rel="noopener" href="' + whatsappHandoffUrl(data.produto) + '">' +
          '<i class="bi bi-whatsapp"></i> Agilizar pelo WhatsApp</a></div>';
      });
  }, true);
}

/* ---------- Init ---------- */

captureUtms(); // captura o mais cedo possível, em qualquer página

document.addEventListener('DOMContentLoaded', () => {
  initLeadModal();
  initContactForm();
});
