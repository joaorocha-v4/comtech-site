# Integração dos formulários do site com o Kommo CRM

Quando alguém envia o formulário (modal de orçamento ou página de contato), o site
chama `/api/lead` — uma função serverless na Vercel — que:

1. valida os dados;
2. cria o **lead + contato (+ empresa)** no Kommo via `POST /api/v4/leads/complex`;
3. anexa uma **nota** com mensagem, página de origem e dados de campanha;
4. replica o lead na **planilha do Google** (Apps Script), que segue como backup;
5. responde `200` sempre — se o Kommo estiver fora, o lead não se perde e o
   evento `lead_form_submit` do GTM/Google Ads continua disparando.

```
Formulário → /api/lead ──► Kommo (lead + contato + nota)
                       └─► Planilha de leads (Apps Script)
```

## Arquivos

| Arquivo | Papel |
|---|---|
| `api/lead.js` | Endpoint que recebe o formulário |
| `api/_kommo.js` | Cliente da API do Kommo (auth, campos, formatação) |
| `scripts/kommo-setup.mjs` | Script de setup: confere token, lista funis/etapas, cria os campos personalizados |
| `src/scripts/lead-form.js` | Front-end: UTMs, validação, envio e fallback |

## Passo 1 — Integração privada no Kommo

1. No Kommo: **Configurações → Integrações → Criar integração** (precisa ser administrador).
2. Marque **Integração privada**. Redirect URL e webhook podem ficar em branco.
3. Em **Permitir acesso**, marque no mínimo: leads, contatos, empresas e catálogos/notas.
4. Salve, abra a integração → aba **Chaves e escopos** → **Gerar token de longa duração**.
5. Escolha a validade (pode ir até 5 anos) e **copie o token — ele não aparece de novo**.
6. Anote o subdomínio da conta (a parte antes de `.kommo.com` na URL).

## Passo 2 — Campos personalizados

Com o token em mãos, na pasta do projeto:

```bash
KOMMO_SUBDOMAIN=seusubdominio KOMMO_TOKEN=seutoken node scripts/kommo-setup.mjs
```

O script confere o token, imprime os **IDs dos funis e etapas** e cria os campos
que faltarem: `Produto de interesse`, `Página do site`, `URL de origem` e os
`utm_*`/`gclid` (o Kommo normalmente já traz os de UTM por padrão — nesse caso
ele apenas reaproveita).

Para criar um lead de teste no CRM:

```bash
KOMMO_SUBDOMAIN=... KOMMO_TOKEN=... node scripts/kommo-setup.mjs --test
```

## Passo 3 — Variáveis de ambiente na Vercel

Em **Project → Settings → Environment Variables** (Production, Preview e Development):

| Variável | Obrigatória | Observação |
|---|---|---|
| `KOMMO_SUBDOMAIN` | sim | ex.: `comtechsaude` |
| `KOMMO_TOKEN` | sim | token de longa duração |
| `SHEETS_ENDPOINT` | recomendada | URL do Apps Script da planilha |
| `KOMMO_PIPELINE_ID` | opcional | funil de destino (do passo 2) |
| `KOMMO_STATUS_ID` | opcional | etapa inicial (do passo 2) |
| `KOMMO_RESPONSIBLE_USER_ID` | opcional | responsável padrão |
| `ALLOWED_ORIGINS` | opcional | domínios extras separados por vírgula |

> ⚠️ O repositório é **público**: o token só pode existir nas variáveis de
> ambiente da Vercel e no `.env` local (já ignorado pelo git).

Depois de salvar as variáveis é preciso **fazer um novo deploy** para elas valerem.

## Passo 4 — Teste ponta a ponta

1. Abra o site, envie o formulário com dados reais de teste.
2. Confira: lead no Kommo, linha na planilha e o evento `lead_form_submit`
   no Preview do GTM (a conversão do Ads depende dele).
3. No painel da Vercel, **Logs** da função `/api/lead` mostram qualquer erro do CRM.

## Manutenção

- O token tem validade: anote a data de expiração e renove antes do vencimento.
- Se um campo for renomeado no Kommo, ajuste o nome em `LEAD_FIELDS` (`api/lead.js`).
- Limite da API do Kommo: 7 requisições por segundo (bem acima do volume do site).
