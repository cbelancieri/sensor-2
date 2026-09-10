# SensorControl

Sistema web de controle de estoque de sensores industriais: cadastro, controle
de estoque, movimentação (entrada/saída por crachá), estrutura de fábrica
(setores/linhas/máquinas) e vínculo entre sensores pareados (emissor/receptor).

> **Se você está pedindo ajuda a uma IA (Claude ou outra) para continuar este
> projeto**: cole este arquivo inteiro na conversa antes de pedir qualquer
> alteração. Ele explica a arquitetura, onde cada coisa fica, e como o
> sistema de "campos por tipo" funciona — sem isso, a IA vai ter que
> adivinhar a estrutura do projeto.

## Stack / Arquitetura

- **Frontend**: HTML + CSS + JavaScript puro (sem framework, sem build step).
  Roda direto no navegador.
- **Backend**: nenhum — o frontend conversa direto com o **Supabase**
  (Postgres + API REST automática + Storage de imagens).
- **Hospedagem**: GitHub (código) → Vercel (publica o site automaticamente a
  cada mudança no repositório).
- **Sem autenticação de usuário**: é uso interno, identificação é só pelo
  crachá nas movimentações. O acesso ao banco usa a chave pública
  ("anon"/"publishable") do Supabase, liberada via RLS (Row Level Security)
  com política de acesso total.

## Estrutura de arquivos

```
sensor-control-supabase/
├── index.html          # HTML da página (SPA de uma página só)
├── style.css            # Todo o CSS
├── supabaseClient.js    # URL + chave do Supabase (única coisa que muda por instalação)
├── options.js            # Configuração de tipos de sensores e suas opções (VEJA ABAIXO)
├── api.js                 # Todas as chamadas ao Supabase (CRUD, upload de imagem, etc.)
├── app.js                  # Toda a lógica de UI: navegação, telas, modal, eventos
└── sql/
    └── schema.sql           # Script SQL completo pra criar o banco do zero
```

## Como o sistema de "campos por tipo" funciona (IMPORTANTE)

Cada tipo de sensor (Conectores, Sensor de Barreira, Chave de Segurança...)
mostra só os campos que fazem sentido pra ele no formulário de cadastro. Isso
é inteiramente controlado em **`options.js`**, no objeto `CAMPOS_POR_TIPO`:

```js
const CAMPOS_POR_TIPO = {
  'Conectores': ['formato', 'conexao', 'ip', 'material', 'aplicacao', 'genero', 'pinos', 'recursos'],
  'Sensor de Barreira': ['distancia', 'tipoSaida', ..., 'papel', 'par'],
  // ...
};
```

**Pra criar um novo tipo de sensor**: só adicionar uma entrada nova nesse
objeto, listando quais "seções" ele usa. As seções disponíveis são:
`distancia`, `tipoSaida`, `logica`, `tensao`, `formaComutacao`, `formato`,
`rosca`, `ip`, `conexao`, `material`, `aplicacao`, `cilindro`, `genero`,
`pinos`, `tamanho`, `papel`, `par`, `recursos`.

Um tipo que **não** tem entrada em `CAMPOS_POR_TIPO` mostra o formulário
"completo" (todos os campos) — isso é só pra manter compatibilidade com
sensores antigos, não é o comportamento esperado pra tipos novos.

Cada tipo também pode sobrescrever as **opções** de alguns campos (em vez de
usar a lista padrão), através de:
- `FORMATO_OPTS_POR_TIPO` — ex: Conectores usa `['Reto', '90°']` em vez da
  lista padrão de formatos
- `CONEXAO_OPTS_POR_TIPO` — ex: Sensor de Cilindro usa `['2 fios', '3 fios', '4 fios']`
- `TAMANHO_OPTS_POR_TIPO` — sugestões pro campo Tamanho (que é texto livre)

O tipo do sensor também não é fixo no código — os tipos "reais" ficam na
tabela `tipos_sensores` do banco (o usuário pode criar novos pelo botão
**"+ Novo tipo"** direto na tela). `CAMPOS_POR_TIPO` só define o
*comportamento* de cada tipo; se um tipo existe no banco mas não tem entrada
aqui, ele usa o formulário completo por padrão.

## Funcionalidades especiais

- **Filtros em cascata**: ao escolher um Tipo na barra lateral, só aparecem
  os filtros relevantes pra ele, e cada filtro seguinte só mostra os valores
  que existem dado o que já foi escolhido antes (lógica em `renderLista()`
  no `app.js`).
- **Upload de imagens**: logo da marca e foto do sensor, guardados no
  Supabase Storage (bucket `sensor-images`, público).
- **Vínculo entre sensores pareados** (`papel` + `par`): usado por "Sensor de
  Barreira" e "Chave de Segurança". Um sensor pode ser vinculado a outro
  (campo `par_sensor_id`, auto-referenciado na tabela `sensores`), sempre
  nos dois sentidos (ver `Api.vincularPar` em `api.js`). Existe um modal de
  consulta separado (só leitura) que mostra os dois lados lado a lado.
- **Nº de Caixa único**: trava de unicidade no banco (`unique` na coluna
  `caixa`), e o campo no formulário é um dropdown mostrando só os números
  de 001 a 200 que ainda não estão em uso.
- **Duplicar sensor**: botão que abre o modal pré-preenchido com os dados de
  um sensor existente, mas salva como um sensor **novo** (não edita o
  original).
- **Exportar PDF**: botão que gera um PDF com foto + dados dos sensores que
  estão sendo exibidos no momento (respeita os filtros ativos).

## Configuração (do zero)

1. Criar um projeto no [Supabase](https://supabase.com)
2. Rodar o `sql/schema.sql` inteiro no SQL Editor do projeto — isso cria
   todas as tabelas, os tipos de sensores padrão, o trigger de estoque, as
   políticas de acesso (RLS) e o bucket de imagens
3. Pegar a **Project URL** e a **chave pública** em
   Project Settings → API, e colar em `supabaseClient.js`
4. Subir o código pro GitHub (repositório privado)
5. Importar o repositório na [Vercel](https://vercel.com) — publica sozinho,
   sem build step (é só HTML/CSS/JS estático)

## Tipos de sensores já cadastrados

Conectores, Espelho Reflexivo, Botoeira, Cabo de Sensor, Chave de Segurança,
Chave Fim de Curso, Ponte Retificadora, Sensor Capacitivo, Sensor de
Barreira, Sensor de Cilindro, Sensor de Pressão, Sensor Fibra Óptica, Sensor
Fotoelétrico Difuso, Sensor Etiqueta, Sensor Fotoelétrico Refletivo, Sensor
de Dupla Chapa, Sensor Indutivo, Sensor Óptico Distância, Sensor
Ultrassônico — cada um com seus próprios campos configurados em
`CAMPOS_POR_TIPO`.

## Testando localmente

Não precisa de Node nem build — só abrir com um servidor estático simples
(pra evitar bloqueio de `fetch` em arquivos `file://`):

```
npx serve .
```

ou

```
python -m http.server 8000
```
