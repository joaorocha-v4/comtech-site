# Conversões offline: Kommo → Google Ads

Fecha o ciclo entre o clique no anúncio e o que aconteceu com o lead lá na frente.
O Google passa a saber **quais cliques viraram lead qualificado e quais viraram venda**,
e usa isso pra procurar mais gente parecida com quem compra — em vez de mais gente
parecida com quem só preenche formulário.

```
Lead muda de etapa no Kommo
        ↓ webhook
/api/kommo-webhook (Vercel)
        ↓ lê o lead: gclid, valor, e-mail, produto
Planilha "Conversões offline"
        ↓ importação diária
Google Ads (Data Manager)
```

## Mapeamento das etapas

| Etapa no Kommo | Conversão no Google Ads | Valor |
|---|---|---|
| Proposta (109867911) | `Lead qualificado (CRM)` | sem valor |
| Fechado - ganho (142) | `Venda (CRM)` | campo "Venda" do lead, em BRL |

Só entram na planilha do Google os leads **com `gclid`** — ou seja, os que vieram de
clique em anúncio. Os demais ficam na aba "Log" pra conferência, o que também serve
de termômetro de quanto do resultado vem do Ads.

Cada conversão é enviada **uma única vez**: ao enviar, o lead ganha a tag
`ads-qualificado` ou `ads-venda`, e o webhook ignora leads que já têm a tag. Se o lead
voltar de etapa e avançar de novo, não conta duas vezes.

## Onde as conversões são gravadas

Na **mesma planilha dos leads** ("[Comtech Saude] Leads Forms Site"), em duas abas
criadas pelo Apps Script:

- **Conversões offline** — só as 5 colunas que o Google Ads importa; entra apenas
  quem tem `gclid`.
- **Log conversões** — todo evento recebido do Kommo, com ou sem `gclid`.

O mesmo App da Web atende os dois fluxos: o parâmetro `tipo=conversao` distingue
uma conversão de um lead. Por isso `CONVERSIONS_ENDPOINT` e `SHEETS_ENDPOINT` têm
o mesmo valor. O código publicado está em `scripts/apps-script-planilha-leads.gs`;
para alterar, edite na planilha (**Extensões → Apps Script**) e publique com
**Implantar → Gerenciar implantações → lápis → Nova versão**, que mantém a URL.

### Proteção contra conversão duplicada

Duas camadas, porque uma só não basta:

1. No Kommo, o lead ganha a tag `ads-qualificado`/`ads-venda` depois do envio, e
   leads com a tag são ignorados.
2. Na planilha, antes de gravar, o script confere se já existe aquela conversão
   para aquele `lead_id` no log. Isso cobre o caso em que a gravação acontece mas
   a resposta demora e o envio é repetido — foi exatamente o que apareceu no teste.

## Passo 1 — Variáveis na Vercel

Acrescente às que já existem (e redeploy):

| Variável | Valor |
|---|---|
| `CONVERSIONS_ENDPOINT` | mesma URL `/exec` de `SHEETS_ENDPOINT` |
| `WEBHOOK_SECRET` | a chave gerada (está no `.env` local) |
| `KOMMO_STATUS_QUALIFICADO` | `109867911` |
| `KOMMO_STATUS_VENDA` | `142` |

## Passo 2 — Webhook no Kommo

```bash
node --env-file=.env scripts/kommo-webhook-register.mjs --criar
```

Confere o que está registrado com o mesmo comando sem `--criar`, e remove com
`--remover <id>`. O endpoint responde ao Kommo em menos de 2 segundos e processa
o resto em segundo plano — exigência do Kommo, que desativa webhooks lentos.

## Passo 3 — Ações de conversão no Google Ads

Em **Metas → Conversões → Nova ação de conversão → Importar → Outras fontes de dados
ou CRMs → Acompanhar conversões de cliques**, crie duas:

| Nome (idêntico ao da planilha) | Categoria | Contagem | Valor |
|---|---|---|---|
| `Lead qualificado (CRM)` | Lead qualificado | Uma | sem valor |
| `Venda (CRM)` | Compra | Uma | usar valor da importação, moeda BRL |

O nome precisa bater **exatamente** com o que vai na coluna `Conversion Name`.

## Passo 4 — Importação da planilha

Em **Ferramentas → Gerenciador de dados**, crie uma conexão com o **Planilhas Google**,
aponte pra planilha de leads, aba **Conversões offline**, e agende a importação
(diária basta). O mapeamento das colunas:

| Coluna da planilha | Campo do Google |
|---|---|
| Google Click ID | GCLID |
| Conversion Name | Nome da conversão |
| Conversion Time | Data/hora da conversão |
| Conversion Value | Valor |
| Conversion Currency | Moeda |

A data já vai com fuso explícito (`-03:00`), então não precisa configurar fuso na
importação.

## Limites que importam

- **90 dias**: o Google só aceita a conversão se o clique aconteceu há menos de 90 dias.
  Se o ciclo de venda for mais longo que isso, a venda não vai casar com o clique — por
  isso a etapa "Proposta" também é enviada, ela chega bem antes.
- **Janela de conversão**: configure a janela da ação de conversão pra cobrir o ciclo
  de vendas (até 90 dias), senão o Google descarta o que chegar depois.
- Espere de 4 a 6 horas entre criar a ação de conversão e a primeira importação, e
  até 2 dias pros números aparecerem nos relatórios.

## Como usar isso nas campanhas

Depois de acumular volume (idealmente ~30 conversões/mês na ação escolhida):

1. Deixe **`Lead qualificado (CRM)`** como conversão principal — é o sinal mais próximo
   do dinheiro que ainda tem volume.
2. **`Venda (CRM)`** como principal também só se houver volume; senão, secundária,
   servindo pra medir e alimentar o Maximizar valor no futuro.
3. Rebaixe **"Lead — Formulário do site"** para secundária quando a conversão de CRM
   tiver volume — senão o Google continua otimizando pra quem preenche formulário,
   que é justamente o que se quer melhorar.

Enquanto o volume não chega, mantenha o formulário como principal: sinal pouco é pior
que sinal imperfeito.
