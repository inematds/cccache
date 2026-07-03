# _BUILD_SPEC — curso cccache (Prompt Caching no Claude Code)

> Documento de coordenação para os subagentes que constroem o curso no **formato-curso-v2**.
> Cada agente DEVE ler a skill `formato-curso-v2` (MASTER_COMPLETO.md, LEARN-LAYER.md, SVG-FUTURISTA.md, CHECKLIST_REVISAO.md) e obedecer TODOS os erros críticos #1–#31.
> Este arquivo dá o **conteúdo** (fatos de caching, já corretos — NÃO invente nem altere) e o **contrato compartilhado** (courseId, manifesto, nav, assets) para as páginas ficarem consistentes.
> `_BUILD_SPEC.md` é interno — NÃO vira página do curso.

## Identidade do curso

- **courseId (meta `inema-course` e namespace `inema.<courseId>`):** `cccache`
- **Título:** `cccache — Prompt Caching no Claude Code`
- **Subtítulo/promessa:** Entenda de verdade o cache que roda por baixo quando você conversa com o Claude Code — o que reaproveita, o que quebra, e como pagar 10% em vez de 100% pelo contexto.
- **Público:** quem usa o Claude Code no dia a dia e quer economia, velocidade e contexto controlado (não precisa ser dev de API).
- **Offline-first:** curso 100% `file://`. SEM dependência de rede. SVGs inline obrigatórios (nada de inemaimg/CDN de imagem). Tailwind via CDN é o único externo (padrão da skill).

## Paleta por trilha

| Trilha | Tema | Cor v2 | Pasta |
|---|---|---|---|
| Trilha 1 — Fundamentos e termos | T1 Emerald | `emerald` | `curso/trilha1/` |
| Trilha 2 — Técnico | T2 Blue | `blue` | `curso/trilha2/` |
| Trilha 3 — Boas práticas avançadas | T3 Purple | `purple` | `curso/trilha3/` |

## Contrato de assets (DRY — referenciar, não colar o par learn.css/learn.js)

- Assets compartilhados: `assets/learn.css` e `assets/learn.js` (construídos pelo agente Fundação).
- **Anti-FOUC** e **`INEMA.init()`** são SEMPRE snippets inline curtos em cada página (nunca externalizados).
- Caminhos relativos por profundidade:
  - Landing `index.html` (raiz): `assets/learn.css`, `assets/learn.js`
  - Trilha `curso/trilhaN/index.html` e módulos `curso/trilhaN/modulo-*.html`: `../../assets/learn.css`, `../../assets/learn.js`

## Nav (idêntico em TODAS as páginas — erro #13)

Logo INEMA + `INEMA.CLUB` (`text-sky-400`, link `https://inema.club`) + 3 botões de trilha + theme toggle. Trilha ativa destacada. Links relativos por profundidade:

- Da **landing** (raiz): `curso/trilha1/index.html`, `curso/trilha2/index.html`, `curso/trilha3/index.html`
- De uma **página em `curso/trilhaN/`**: `../trilha1/index.html`, `../trilha2/index.html`, `../trilha3/index.html`, e a landing em `../../index.html`

Rótulos dos botões: `Fundamentos` (T1), `Técnico` (T2), `Boas práticas` (T3).

## Manifesto do curso (erro #28 — COLAR IDÊNTICO no `<head>` de TODA página)

Cada agente ajusta a forma exata ao LEARN-LAYER §1.7/§3.9, mas mantém estes `id`/`title`/`topics`/`href` SEM alterar. `topics` casa 1:1 com os `data-inema-topic="<moduloId>#<topicoId>"` reais de cada módulo.

```json
{
  "course": { "id": "cccache", "title": "cccache — Prompt Caching no Claude Code" },
  "tracks": [
    {
      "id": "trilha1", "title": "Fundamentos e termos",
      "modules": [
        { "id": "modulo-1-1", "title": "O que é prompt caching", "href": "curso/trilha1/modulo-1-1.html",
          "topics": ["topico-1","topico-2","topico-3","topico-4","topico-5","topico-6"] },
        { "id": "modulo-1-2", "title": "Termos e economia", "href": "curso/trilha1/modulo-1-2.html",
          "topics": ["topico-1","topico-2","topico-3","topico-4","topico-5","topico-6"] }
      ]
    },
    {
      "id": "trilha2", "title": "Técnico",
      "modules": [
        { "id": "modulo-2-1", "title": "O cache numa conversa", "href": "curso/trilha2/modulo-2-1.html",
          "topics": ["topico-1","topico-2","topico-3","topico-4","topico-5","topico-6"] },
        { "id": "modulo-2-2", "title": "Skills e ferramentas: anexar vs quebrar", "href": "curso/trilha2/modulo-2-2.html",
          "topics": ["topico-1","topico-2","topico-3","topico-4","topico-5","topico-6"] },
        { "id": "modulo-2-3", "title": "Invalidação a fundo", "href": "curso/trilha2/modulo-2-3.html",
          "topics": ["topico-1","topico-2","topico-3","topico-4","topico-5","topico-6"] }
      ]
    },
    {
      "id": "trilha3", "title": "Boas práticas avançadas",
      "modules": [
        { "id": "modulo-3-1", "title": "Cache vs Compactação", "href": "curso/trilha3/modulo-3-1.html",
          "topics": ["topico-1","topico-2","topico-3","topico-4","topico-5","topico-6"] },
        { "id": "modulo-3-2", "title": "Arquitetura pró-cache e auditoria", "href": "curso/trilha3/modulo-3-2.html",
          "topics": ["topico-1","topico-2","topico-3","topico-4","topico-5","topico-6"] },
        { "id": "modulo-3-3", "title": "Prompts prontos (copy-run)", "href": "curso/trilha3/modulo-3-3.html",
          "topics": ["topico-1","topico-2","topico-3","topico-4","topico-5","topico-6"] }
      ]
    }
  ]
}
```

---

# CONTEÚDO — fatos de caching (base de verdade; NÃO inventar nem contradizer)

**O invariante que explica tudo:** prompt caching é um **casamento de prefixo**. A chave do cache são os bytes exatos do prompt até um ponto de corte (`cache_control`). Qualquer byte que mude no prefixo invalida tudo dali pra frente. Ordem de montagem: **`tools` → `system` → `messages`**.

**Números de economia (usar consistente em todo o curso):** leitura do cache (hit) ≈ **0,1×** do preço de input; gravação (write) ≈ **1,25×** com TTL de 5 min e ≈ **2×** com TTL de 1 h; token não-cacheado = **1×** (cheio). Break-even: com TTL 5 min, 2 requisições já compensam; com 1 h, ~3.

**Campos de verificação:** `cache_read_input_tokens` (lido do cache), `cache_creation_input_tokens` (gravado), `input_tokens` (só o resto não-cacheado). Total do prompt = soma dos três. Se `cache_read_input_tokens` fica 0 repetindo o mesmo prefixo → tem silent invalidator.

## TRILHA 1 — Fundamentos e termos (emerald). Todo módulo aqui é FUNDAMENTO: define cada termo na 1ª aparição (erro #31), estilo "Novo aqui?".

### modulo-1-1.html — "O que é prompt caching"
- **topico-1 — O problema: reprocessar tudo toda vez.** A API é stateless: a cada mensagem você reenvia a conversa inteira (prompt de sistema + ferramentas + histórico). Sem cache, o modelo reprocessa tudo do zero todo turno — caro e lento. ("Prompt de sistema" = o texto de instruções que vem antes da conversa; "stateless" = a API não guarda a conversa, você reenvia sempre.)
- **topico-2 — A ideia: reaproveitar o prefixo.** O começo da conversa é estável e se repete a cada turno. O cache guarda esse começo já processado e reaproveita, em vez de reprocessar.
- **topico-3 — O invariante: casamento de prefixo.** A chave são os bytes exatos até o ponto de corte. UM byte diferente no meio invalida tudo dali pra frente. (Definir "prefixo" = o pedaço do começo que se repete igual.)
- **topico-4 — A ordem: tools → system → messages.** O prompt é montado nessa ordem. Um breakpoint no fim do `system` cacheia tools + system juntos. Coisa estável vai no começo; coisa que muran a cada requisição vai no fim.
- **topico-5 — Hit, miss e write.** Hit = leu do cache (barato). Write = gravou no cache (leve prêmio). Miss = não achou, processou cheio. A 1ª mensagem grava; as seguintes leem.
- **topico-6 — Breakpoint (`cache_control`).** É a marca que diz "cacheie até aqui". Máx. 4 por requisição; prefixo mínimo cacheável ~1024–4096 tokens (varia por modelo) — abaixo disso não cacheia e não dá erro. No Claude Code isso é automático; o aluno não precisa marcar à mão, mas precisa entender o conceito.

### modulo-1-2.html — "Termos e economia"
- **topico-1 — `cache_read_input_tokens`.** Tokens servidos do cache neste turno; custam ~0,1×.
- **topico-2 — `cache_creation_input_tokens`.** Tokens gravados no cache neste turno; custam ~1,25× (5 min) ou ~2× (1 h).
- **topico-3 — `input_tokens` (o resto).** Só a parte NÃO cacheada, preço cheio. Pegadinha: se seu agente rodou horas e `input_tokens` mostra pouco, o resto veio do cache — olhe a SOMA dos três, não um campo só.
- **topico-4 — TTL: 5 min e 1 h.** TTL = tempo de vida da entrada. Padrão 5 min, renovado a cada uso (conversa ativa mantém quente). Existe opção de 1 h (write mais caro, ~2×) pra tráfego com pausas longas.
- **topico-5 — Custos relativos.** read ~0,1× · write 5min ~1,25× · write 1h ~2× · não-cacheado 1×. Numa conversa longa, o grosso do input (system + histórico) sai a ~10% do preço.
- **topico-6 — Break-even.** 5 min: 2 requisições já pagam o write (1,25× + 0,1× = 1,35× vs 2× sem cache). 1 h: precisa ~3. Não cacheie prefixo que muda todo request (só paga write, nunca lê).

## TRILHA 2 — Técnico (blue). Módulos técnicos: cada um traz ≥1 exemplo copy-run (erro #30) — prompt/comando pronto com objetivo + bloco + como verificar.

### modulo-2-1.html — "O cache numa conversa"
- **topico-1 — O prefixo estável cresce.** system + tools + todo o histórico (inclusive a última resposta) viram o prefixo estável, que cresce a cada turno.
- **topico-2 — Hit por turno.** A cada mensagem nova, só o final muda; a API relê todo o prefixo do cache (~0,1×) e grava só o novo.
- **topico-3 — TTL de 5 min renovado por uso.** Enquanto você responde dentro de ~5 min, a janela renova e o cache fica quente.
- **topico-4 — A % de cache SOBE a cada turno.** Não é uma bateria que descarrega. Um turno pode marcar 40% (porque teve coisa nova, ex.: uma skill grande carregada). Esse bloco novo vira read barato no próximo turno. Tabela: turno agora 40k lido / 60k novo = 40%; próximo turno (+ msg curta) ~100k lido / ~1k novo = ~99%.
- **topico-5 — Primeira mensagem = write.** Não tem o que ler ainda; ela grava o cache (paga um pouco mais).
- **topico-6 — Pausa longa = write frio.** Passou dos ~5 min parado, o TTL expira e a próxima mensagem paga a gravação de novo.
- **Exemplo copy-run:** prompt pro Claude Code — "Verifique numa resposta da API os campos `cache_read_input_tokens`, `cache_creation_input_tokens` e `input_tokens` e me explique quanto veio do cache." + como verificar (a soma dos 3 = tamanho do prompt).

### modulo-2-2.html — "Skills e ferramentas: anexar vs quebrar"
- **topico-1 — Dois sentidos de "skill".** (a) A DESCRIÇÃO da skill (linha curta na lista de skills) fica sempre no prefixo estável. (b) O CONTEÚDO completo (o documentão) só entra quando a skill é invocada.
- **topico-2 — Skill no meio da conversa NÃO zera o cache.** O conteúdo entra ANEXADO no FIM do histórico (não na posição 0). Tudo antes continua válido e é lido barato; só o bloco novo da skill é gravado (um write). Nos turnos seguintes ela já é read barato.
- **topico-3 — Quebrar a lista de `tools` = posição 0.** As ferramentas são renderizadas na posição 0 (antes de system e histórico). Mudar a lista `tools` invalida TUDO.
- **topico-4 — Exemplos de quebra.** (1) Conectar/desconectar um servidor MCP no meio (registra tools novas). (2) Mudar `description` ou `input_schema` de uma tool (basta uma palavra). (3) Ordem não-determinística: montar `tools` de um `set`/`dict` sem ordenar → ordem varia entre requests. (4) Ligar/desligar tools por modo/permissão.
- **topico-5 — Tool Search anexa de propósito.** O Tool Search carrega o schema de uma ferramenta ANEXANDO (não trocando a lista) — feito justamente pra NÃO quebrar o cache. Descobrir tool via Tool Search é seguro; conectar MCP que reescreve a lista, não.
- **topico-6 — Regra de bolso.** Conteúdo novo no FIM = seguro. Mexer na lista de `tools` ou no system prompt = reset da posição 0.
- **Exemplo copy-run:** trecho de código montando `tools` — versão ❌ (de `set`/`dict` sem sort → cache nunca bate) vs ✅ (`sorted(...)` → prefixo idêntico). Como verificar: `cache_read_input_tokens` deixa de ser 0 entre requests iguais.

### modulo-2-3.html — "Invalidação a fundo"
- **topico-1 — Hierarquia de 3 tiers.** Mudança só invalida o tier dela e os de baixo. Tabela: mudar tools OU trocar modelo = reset total (tools+system+messages); mudar system = invalida system+messages; mudar mensagem = só messages.
- **topico-2 — `tool_choice`/`thinking` on-off NÃO derrubam tudo.** Trocar `tool_choice` por request ou ligar/desligar `thinking` mantém o cache de tools+system. Não precisa se preocupar com esses.
- **topico-3 — 20-block lookback.** Cada breakpoint procura entrada anterior olhando no máx. 20 blocos pra trás. Turno que adiciona >20 blocos (loops com muitos tool_use/tool_result) pode fazer o próximo turno errar o cache silenciosamente. Fix: breakpoint intermediário a cada ~15 blocos.
- **topico-4 — Silent invalidators.** `datetime.now()`/`Date.now()`/uuid no system; `json.dumps` sem `sort_keys=True`; iterar `set`; tools montadas por usuário; seção condicional no system (`if flag: system += ...`). Sintoma: `cache_read_input_tokens` sempre 0.
- **topico-5 — Timing concorrente (fan-out).** A entrada só fica legível DEPOIS que a 1ª resposta começa a streamar. N requests paralelos com o mesmo prefixo pagam todos preço cheio. Fix: mandar 1, esperar o 1º token, disparar os N-1.
- **topico-6 — Verificar com `usage`.** `cache_read_input_tokens` / `cache_creation_input_tokens` na resposta. Zero em requests repetidos = tem invalidator; faça diff dos bytes do prompt entre dois requests.
- **Exemplo copy-run:** prompt pro Claude Code — "Audite este pipeline: procure `datetime.now()`, `uuid`, `json.dumps` sem `sort_keys` e montagem de `tools` por `set` no que alimenta o prefixo; aponte cada silent invalidator e como corrigir." + como verificar.

## TRILHA 3 — Boas práticas avançadas (purple). Fecha com módulo de PROMPTS PRONTOS copy-run.

### modulo-3-1.html — "Cache vs Compactação"
- **topico-1 — Dois eixos diferentes.** Cache = otimiza o PREÇO POR TOKEN do contexto. Compactar = otimiza QUANTOS tokens você carrega. Não competem no mesmo eixo. (Definir "compactar" = resumir o histórico numa versão menor; no Claude Code, `/compact`.)
- **topico-2 — Contexto grande cacheado ainda é caro.** Cache barateia por token, mas 400k tokens lidos a 0,1× ainda equivalem a ~40k de input CHEIO por turno, todo turno.
- **topico-3 — O teto do contexto (1M) — cache não resolve.** O cache deixa 900k tokens baratos, mas eles ainda ocupam 900k de 1M. Uma hora você não continua sem compactar/`/clear`. Só compactar/limpar resolve o teto.
- **topico-4 — Compactar: 1 write frio → turnos leves (números).** Tabela: sem compactar, 400k @0,1× ≈ 40k-equiv por turno, pra sempre. Compactando pra 20k: 1 write frio 20k @1,25× ≈ 25k (uma vez), depois 20k @0,1× ≈ 2k-equiv por turno. Payback em ~1 turno; cada turno seguinte ~20× mais leve.
- **topico-5 — Qualidade e latência.** Contexto inchado espalha a atenção do modelo ("context rot") → erra e enrola mais. E mesmo lido do cache, 400k levam mais tempo que 20k (TTFT maior). Compactar melhora os dois.
- **topico-6 — Quando compactar / quando NÃO.** Conversa pequena → NÃO compacte (só perde o cache quente sem ganho — essa é a intuição certa). Contexto grande, perto do teto, ou qualidade caindo → compacte (troca 1 write frio único por turnos muito mais leves).

### modulo-3-2.html — "Arquitetura pró-cache e auditoria"
- **topico-1 — System prompt congelado.** Não interpolar data/hora, modo, nome do usuário no system (fica na frente do prefixo e invalida tudo). Injete contexto dinâmico depois, nas `messages`.
- **topico-2 — Tools determinísticas.** Serialize a lista sempre na mesma ordem (ordene por nome). Set/dict sem sort = ordem variável = miss.
- **topico-3 — Não trocar modelo no meio.** Cache é por modelo. Trocar de modelo invalida tudo. Precisa de um modelo mais barato pra subtarefa? Use subagente, mantendo o loop principal num modelo só.
- **topico-4 — Fork reusa o prefixo do pai.** Operação lateral (resumo, subagente) que remonta system/tools/model diferente perde o cache do pai. Copie system/tools/model verbatim e anexe o específico no fim.
- **topico-5 — Checklist de silent invalidators.** Varra o que alimenta o prefixo: `datetime.now()`, uuid, `json.dumps` sem `sort_keys`, set, tools por usuário, seções condicionais no system.
- **topico-6 — Pré-aquecimento e TTL 1h.** Requisição `max_tokens: 0` ao subir o app grava o cache do prefixo e retorna na hora — tira a latência do 1º request real. Só vale se: 1ª latência é visível, prefixo é grande, e há um momento antes do tráfego. TTL 1h (write ~2×) pra tráfego com gaps > 5 min.
- **Exemplo copy-run:** prompt pro Claude Code — "Revise meu system prompt e a montagem de `tools`: aponte o que está impedindo cache (interpolação dinâmica no system, ordem de tools não-determinística) e reescreva pra maximizar hit." + como verificar.

### modulo-3-3.html — "Prompts prontos (copy-run)" — módulo PRÁTICO, cada tópico é um prompt colável real (erro #30), com objetivo + bloco copiável (`<isto voce troca>`) + como verificar.
- **topico-1 — Auditar cache de um pipeline.** Prompt que manda o Claude Code varrer o código que monta o prompt e listar cada silent invalidator + fix.
- **topico-2 — Tornar a lista de tools determinística.** Prompt que pede ordenar a serialização de `tools` por nome e confirmar ordem estável entre requests.
- **topico-3 — Decidir compactar vs continuar.** Prompt que estima o custo por turno de carregar o contexto atual vs o custo único de compactar, e recomenda.
- **topico-4 — Diagnosticar `cache_read_input_tokens = 0`.** Prompt que faz diff dos bytes do prefixo entre dois requests iguais e aponta o byte que muda.
- **topico-5 — Revisar system prompt pró-cache.** Prompt que tira interpolação dinâmica do system e move pro fim das messages.
- **topico-6 — Estratégia de breakpoints.** Prompt que sugere onde colocar `cache_control` (fim do system estável; fim do trecho compartilhado num prefixo+sufixo variável) e alerta sobre o 20-block lookback.

---

## Checklist de consistência entre agentes (conferir antes de entregar cada página)
1. `courseId = cccache` no `<meta name="inema-course">` e no namespace.
2. Manifesto IDÊNTICO (o JSON acima) no `<head>` de toda página.
3. Nav idêntico (3 trilhas + INEMA.CLUB sky + theme toggle), links relativos certos pela profundidade.
4. `../../assets/learn.css` e `../../assets/learn.js` nas páginas de `curso/trilhaN/`; `assets/...` na landing.
5. Cores: T1 emerald, T2 blue, T3 purple.
6. Cada módulo: ≥6 tópicos, 500–800 linhas, ≥1 SVG futurista inline, variedade de componentes; módulos técnicos/práticos com ≥1 exemplo copy-run; módulos de fundamento definem termos inline.
7. Anti-FOUC inline primeiro no `<head>`; `INEMA.init()` por último.
