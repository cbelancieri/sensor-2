// ============================================================
// Estado global
// ============================================================
const state = {
  page: 'lista',
  sensores: [],
  estrutura: [],
  movimentacoes: [],
  kpis: null,
  filtros: {},
  editSensorId: null,
  modalRecursos: [],
  modalFormaComutacao: '',
  modalMarcaLogoUrl: null,
  modalFotoUrl: null,
  tiposSensores: [],
};

function showError(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = msg;
  el.classList.remove('hidden', 'banner-success');
  setTimeout(() => el.classList.add('hidden'), 6000);
}

function showSuccess(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('banner-success');
  setTimeout(() => { el.classList.add('hidden'); el.classList.remove('banner-success'); }, 4000);
}

// Carrega os tipos de sensores do banco (com fallback pra lista padrão
// caso a tabela ainda não exista ou dê erro de conexão)
async function carregarTipos() {
  try {
    state.tiposSensores = await Api.listarTipos();
  } catch (err) {
    state.tiposSensores = SENSOR_TYPES;
  }
}

// ============================================================
// Navegação
// ============================================================
document.querySelectorAll('.sidebar-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    state.page = item.dataset.page;
    if (state.page !== 'lista') {
      document.getElementById('sidebar-filtros').innerHTML = '';
    }
    render();
  });
});

async function render() {
  const content = document.getElementById('page-content');
  content.innerHTML = '<div class="empty-state">Carregando...</div>';
  try {
    if (state.tiposSensores.length === 0) await carregarTipos();
    if (state.page === 'lista') await renderLista();
    else if (state.page === 'movimentacao') await renderMovimentacao();
    else if (state.page === 'estrutura') await renderEstrutura();
    else if (state.page === 'dashboard') await renderDashboard();
  } catch (err) {
    showError(err.message);
    content.innerHTML = `<div class="empty-state">Não foi possível carregar os dados. Verifique a conexão com o Supabase.</div>`;
  }
}

// ============================================================
// PÁGINA: Lista de Sensores
// ============================================================
async function renderLista() {
  const tipoSelecionado = state.filtros.tipo;
  const secoesAtivas = tipoSelecionado ? (CAMPOS_POR_TIPO[tipoSelecionado] || FILTROS_PADRAO) : [];
  const secoesFiltraveis = secoesAtivas
    .filter(s => SECAO_PARA_FILTRO[s]) // recursos/cilindro/par não viram dropdown de filtro
    .filter(s => s !== 'rosca' || state.filtros.formato === 'Cilíndrico roscado'); // rosca só aparece com esse formato selecionado

  // Busca todos os sensores do tipo selecionado (ignorando os demais filtros)
  // e vai estreitando progressivamente: as opções do 2º filtro consideram
  // o 1º já selecionado, as do 3º consideram o 1º e o 2º, e assim por diante.
  let sensoresDoTipo = [];
  if (tipoSelecionado) {
    sensoresDoTipo = await Api.listarSensores({ tipo: tipoSelecionado });
  }
  const opcoesPorSecao = {};
  let sensoresRestantes = sensoresDoTipo;
  secoesFiltraveis.forEach(secao => {
    const campo = SECAO_PARA_CAMPO[secao];
    if (secao === 'recursos') {
      // Recursos é uma lista (um sensor pode ter vários) — precisa "achatar"
      opcoesPorSecao[secao] = [...new Set(sensoresRestantes.flatMap(s => s.Recursos || []))].sort();
    } else {
      opcoesPorSecao[secao] = [...new Set(sensoresRestantes.map(s => s[campo]).filter(Boolean))].sort();
    }
    const chaveFiltro = SECAO_PARA_FILTRO[secao];
    const valorSelecionado = state.filtros[chaveFiltro];
    if (valorSelecionado) {
      sensoresRestantes = secao === 'recursos'
        ? sensoresRestantes.filter(s => (s.Recursos || []).includes(valorSelecionado))
        : sensoresRestantes.filter(s => s[campo] === valorSelecionado);
    }
  });

  state.sensores = await Api.listarSensores(state.filtros);
  const content = document.getElementById('page-content');

  // Filtros vão pro menu lateral principal (não pro conteúdo)
  const sidebarFiltros = document.getElementById('sidebar-filtros');
  sidebarFiltros.innerHTML = `
    <div class="filters-head">
      <div class="section-title" style="color:#cfd4d9;">Filtros</div>
      <div class="link-action" id="btn-limpar-filtros" style="color:#8bb0ff;">Limpar</div>
    </div>
    <div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
      <input id="f-busca" placeholder="Buscar por nome, marca ou cód. fabricante...">
      <input id="f-caixa" placeholder="Nº Caixa">
      ${selectHtml('f-tipo', 'Tipo de sensor', state.tiposSensores)}
    </div>
    ${!tipoSelecionado ? '<div style="font-size:11.5px; color:#8b94a0; margin-top:10px;">Selecione um tipo de sensor acima pra ver os filtros específicos dele.</div>' : `
    <div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
      ${secoesFiltraveis.map(secao => selectHtml(
        `f-${SECAO_PARA_FILTRO[secao]}`,
        SECAO_LABEL[secao],
        opcoesPorSecao[secao]
      )).join('')}
    </div>`}
  `;

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Sensores</h1>
        <div class="page-subtitle">${state.sensores.length} sensor(es) cadastrado(s)</div>
      </div>
      <div style="display:flex; gap:10px;">
        <button class="btn-secondary" id="btn-exportar-pdf">Exportar PDF</button>
        <button class="btn-primary" id="btn-novo-sensor">+ Novo Sensor</button>
      </div>
    </div>

    <div class="card" style="padding:0; max-height:calc(100vh - 190px); overflow:auto;">
      ${state.sensores.length === 0 ? '<div class="empty-state">Nenhum sensor encontrado.</div>' : `
      <table>
        <thead>
          <tr>
            <th>Caixa</th><th>Cód. Fab.</th><th>Cód. DV</th><th></th>
            <th>Nome</th><th>Especificações</th><th>Marca</th><th>Estoque</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${state.sensores.map(sensorRowHtml).join('')}
        </tbody>
      </table>`}
    </div>
  `;

  document.getElementById('btn-novo-sensor').addEventListener('click', () => openModal());
  document.getElementById('btn-exportar-pdf').addEventListener('click', () => exportarPdf(state.sensores));
  document.getElementById('btn-limpar-filtros').addEventListener('click', () => { state.filtros = {}; render(); });

  const filterMap = { 'f-busca': 'busca', 'f-caixa': 'caixa', 'f-tipo': 'tipo' };
  secoesFiltraveis.forEach(secao => { filterMap[`f-${SECAO_PARA_FILTRO[secao]}`] = SECAO_PARA_FILTRO[secao]; });

  Object.entries(filterMap).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = state.filtros[key] || '';
    el.addEventListener('change', () => {
      // Trocar o tipo reseta os filtros específicos do tipo anterior
      if (key === 'tipo') {
        const busca = state.filtros.busca;
        const caixa = state.filtros.caixa;
        state.filtros = { busca, caixa, tipo: el.value };
        if (!busca) delete state.filtros.busca;
        if (!caixa) delete state.filtros.caixa;
        if (!el.value) delete state.filtros.tipo;
      } else {
        state.filtros[key] = el.value;
        if (!el.value) delete state.filtros[key];

        // Limpa os filtros seguintes na cascata (os valores deles podem
        // não fazer mais sentido com a nova combinação escolhida)
        const posicaoAtual = secoesFiltraveis.findIndex(secao => SECAO_PARA_FILTRO[secao] === key);
        if (posicaoAtual !== -1) {
          secoesFiltraveis.slice(posicaoAtual + 1).forEach(secao => {
            delete state.filtros[SECAO_PARA_FILTRO[secao]];
          });
        }
      }
      render();
    });
  });

  content.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.edit));
  });
  content.querySelectorAll('[data-duplicar]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.duplicar, { duplicar: true }));
  });
  content.querySelectorAll('[data-consultar-par]').forEach(btn => {
    btn.addEventListener('click', () => abrirConsultaPar(btn.dataset.consultarPar));
  });
  content.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Você tem certeza que deseja remover este sensor? Essa ação não pode ser desfeita.')) {
        try {
          await Api.removerSensor(btn.dataset.delete);
          render();
        } catch (err) { showError(err.message); }
      }
    });
  });
}

function selectHtml(id, placeholder, options) {
  return `<select id="${id}"><option value="">${placeholder}</option>${options.map(o => `<option value="${o}">${o}</option>`).join('')}</select>`;
}

// Divide um array em blocos de tamanho "tamanho" — usado pra limitar
// quantas badges de especificação aparecem por linha na listagem
function chunk(array, tamanho) {
  const resultado = [];
  for (let i = 0; i < array.length; i += tamanho) {
    resultado.push(array.slice(i, i + tamanho));
  }
  return resultado;
}

// ============================================================
// Exportar lista de sensores em PDF (com fotos)
// ============================================================
async function imagemParaBase64(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    return null;
  }
}

function formatoImagem(dataUrl) {
  if (!dataUrl) return 'JPEG';
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'JPEG';
}

async function exportarPdf(sensores) {
  if (!sensores || sensores.length === 0) {
    showError('Não há sensores pra exportar com os filtros atuais.');
    return;
  }

  const btn = document.getElementById('btn-exportar-pdf');
  const textoOriginal = btn.textContent;
  btn.disabled = true;

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margemX = 14;
    const larguraPagina = doc.internal.pageSize.getWidth();
    const alturaPagina = doc.internal.pageSize.getHeight();
    let y = 18;

    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('Lista de Sensores', margemX, y);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(120);
    y += 6;
    doc.text(`${sensores.length} sensor(es) — gerado em ${new Date().toLocaleString('pt-BR')}`, margemX, y);
    doc.setTextColor(0);
    y += 8;

    for (let i = 0; i < sensores.length; i++) {
      btn.textContent = `Gerando... (${i + 1}/${sensores.length})`;
      const s = sensores[i];
      const alturaBloco = 34;

      // Quebra de página se não couber o próximo bloco
      if (y + alturaBloco > alturaPagina - 12) {
        doc.addPage();
        y = 18;
      }

      // Linha separadora
      doc.setDrawColor(224);
      doc.line(margemX, y, larguraPagina - margemX, y);
      y += 5;

      // Foto (se tiver)
      const fotoX = margemX;
      const fotoTam = 24;
      if (s.FotoUrl) {
        const base64 = await imagemParaBase64(s.FotoUrl);
        if (base64) {
          try { doc.addImage(base64, formatoImagem(base64), fotoX, y, fotoTam, fotoTam); } catch (e) { /* ignora imagem que falhar */ }
        }
      }

      // Texto ao lado da foto
      const textoX = fotoX + fotoTam + 6;
      let textoY = y + 4;

      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text(s.Nome || 'Sem nome', textoX, textoY);
      textoY += 5;

      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(90);
      doc.text(`Caixa: ${s.Caixa || '—'}   |   Cód. Fab.: ${s.CodFabricante || '—'}   |   Cód. DV: ${s.CodDV || '—'}`, textoX, textoY);
      textoY += 4.5;
      doc.text(`Marca: ${s.Marca || '—'}   |   Estoque: ${s.Estoque ?? 0}`, textoX, textoY);
      textoY += 4.5;
      doc.setTextColor(0);

      // Especificações (mesma lógica usada na listagem)
      const secoes = (CAMPOS_POR_TIPO[s.Tipo] || FILTROS_PADRAO).filter(sec => sec !== 'recursos');
      const valoresSecoes = secoes.map(sec => SECAO_PARA_CAMPO[sec] ? s[SECAO_PARA_CAMPO[sec]] : null).filter(Boolean);
      const specs = [s.Tipo, ...valoresSecoes, ...(s.Recursos || [])].filter(Boolean);
      if (specs.length > 0) {
        doc.setFontSize(8.5);
        doc.setTextColor(70);
        const linhaSpecs = doc.splitTextToSize(specs.join('  •  '), larguraPagina - textoX - margemX);
        doc.text(linhaSpecs, textoX, textoY);
        textoY += linhaSpecs.length * 3.8;
        doc.setTextColor(0);
      }

      y += alturaBloco;
    }

    doc.save(`sensores-${new Date().toISOString().slice(0, 10)}.pdf`);
  } catch (err) {
    showError('Erro ao gerar o PDF: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

function sensorRowHtml(s) {
  const secoes = CAMPOS_POR_TIPO[s.Tipo] || FILTROS_PADRAO;
  const valoresSecoes = secoes
    .filter(sec => sec !== 'recursos') // recursos é lista, tratado à parte abaixo
    .map(sec => SECAO_PARA_CAMPO[sec] ? s[SECAO_PARA_CAMPO[sec]] : null)
    .filter(Boolean);
  const specsAll = [s.Tipo, ...valoresSecoes, ...(s.Recursos || [])].filter(Boolean);
  const estoqueBaixo = s.Estoque <= 3;
  return `
    <tr>
      <td>${s.Caixa || '—'}</td>
      <td style="font-family:'IBM Plex Mono',monospace;">${s.CodFabricante || '—'}</td>
      <td style="font-family:'IBM Plex Mono',monospace;">${s.CodDV || '—'}</td>
      <td>${s.FotoUrl ? `<div style="width:90px; height:56px; border-radius:6px; overflow:hidden; background:#f0f0f0;"><img src="${s.FotoUrl}" style="width:100%; height:100%; object-fit:contain;"></div>` : '<div class="foto-placeholder"></div>'}</td>
      <td style="font-weight:600;">
        ${s.Nome}
        ${(CAMPOS_POR_TIPO[s.Tipo] || []).includes('par') ? (
          s.ParSensorId
            ? `<div style="font-weight:400; font-size:11px; color:var(--text-light); margin-top:2px;">Vínculo: cx ${s.ParCaixa || '?'} <button class="link-action" data-consultar-par="${s.Id}" style="font-size:11px; border:none; background:none; cursor:pointer;">Ver</button></div>`
            : `<div style="font-weight:400; font-size:11px; color:var(--text-light); margin-top:2px;">Sem vínculo</div>`
        ) : ''}
      </td>
      <td style="white-space:normal;">${chunk(specsAll, 4).map(linha =>
        `<div style="display:flex; gap:4px; margin-bottom:4px;">${linha.map(sp => `<span class="badge">${sp}</span>`).join('')}</div>`
      ).join('')}</td>
      <td>${s.MarcaLogoUrl
        ? `<div style="display:flex; flex-direction:column; align-items:flex-start; gap:2px;"><img src="${s.MarcaLogoUrl}" style="width:60px; height:60px; object-fit:contain; border-radius:4px;" onerror="this.style.display='none'"><span style="font-size:10.5px; color:var(--text-light);">${s.Marca || ''}</span></div>`
        : (s.Marca || '—')}</td>
      <td><span class="badge ${estoqueBaixo ? 'badge-warning' : ''}">${s.Estoque}</span></td>
      <td>
        <div class="acoes-linha">
          <button class="btn-icon" data-edit="${s.Id}" title="Editar">✎</button>
          <button class="btn-icon" data-duplicar="${s.Id}" title="Criar sensor similar" style="background:var(--text-light);">⧉</button>
          <button class="btn-icon danger" data-delete="${s.Id}" title="Remover">×</button>
        </div>
      </td>
    </tr>
  `;
}

// ============================================================
// MODAL: Cadastro / Edição de Sensor
// ============================================================
async function openModal(id = null, opcoes = {}) {
  const duplicar = !!opcoes.duplicar;
  state.editSensorId = duplicar ? null : id; // duplicar sempre CRIA um sensor novo
  let sensor = {};
  if (id) {
    sensor = await Api.buscarSensor(id);
    state.modalRecursos = sensor.Recursos || [];
    state.modalFormaComutacao = sensor.FormaComutacao || '';
    state.modalMarcaLogoUrl = sensor.MarcaLogoUrl || null;
    state.modalFotoUrl = sensor.FotoUrl || null;
  } else {
    state.modalRecursos = [];
    state.modalFormaComutacao = '';
    state.modalMarcaLogoUrl = null;
    state.modalFotoUrl = null;
  }

  document.getElementById('modal-title').textContent = duplicar
    ? 'Novo Sensor (baseado em existente)'
    : (id ? 'Editar Sensor' : 'Cadastrar Sensor');
  document.getElementById('modal-content').innerHTML = modalFormHtml(sensor);
  document.getElementById('modal-overlay').classList.remove('hidden');

  wireModalEvents(sensor);
}

function modalFormHtml(s) {
  return `
    <div class="field-group grid" style="grid-template-columns:1.5fr 1.2fr 1fr 1fr 1fr;">
      <div><span class="field-label">Nome</span><input id="m-nome" value="${s.Nome || ''}"></div>
      <div><span class="field-label">Cód. Fabricante</span><input id="m-codFabricante" value="${s.CodFabricante || ''}"></div>
      <div><span class="field-label">Cód. DV</span><input id="m-codDV" value="${s.CodDV || ''}"></div>
      <div><span class="field-label">Marca</span><input id="m-marca" value="${s.Marca || ''}"></div>
      <div><span class="field-label">Estoque</span><input id="m-estoque" type="number" value="${s.Estoque ?? 0}"></div>
    </div>

    <div class="field-group grid" style="grid-template-columns:1fr 1fr;">
      <div>
        <span class="field-label">Logo da marca</span>
        <input id="m-logo-marca-file" type="file" accept="image/*" style="width:100%; font-size:12px;">
        <div id="preview-logo-marca" style="margin-top:6px; width:60px; height:36px; border-radius:4px; overflow:hidden; ${s.MarcaLogoUrl ? 'background:#f6f6f6;' : ''}">${s.MarcaLogoUrl ? `<img src="${s.MarcaLogoUrl}" style="width:100%; height:100%; object-fit:contain;">` : ''}</div>
      </div>
      <div>
        <span class="field-label">Foto do sensor</span>
        <input id="m-foto-sensor-file" type="file" accept="image/*" style="width:100%; font-size:12px;">
        <div id="preview-foto-sensor" style="margin-top:6px; width:64px; height:64px; border-radius:6px; overflow:hidden; ${s.FotoUrl ? 'background:#f6f6f6;' : ''}">${s.FotoUrl ? `<img src="${s.FotoUrl}" style="width:100%; height:100%; object-fit:cover;">` : ''}</div>
      </div>
    </div>

    <div class="section-title-modal">Tipo</div>
    <div class="field-group" style="display:flex; gap:8px; align-items:flex-start;">
      <select id="m-tipo" style="width:100%;">
        <option value="">Selecione...</option>
        ${state.tiposSensores.map(t => `<option value="${t}" ${s.Tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <button type="button" class="btn-secondary" id="btn-novo-tipo" style="white-space:nowrap;" title="Criar novo tipo de sensor">+ Novo tipo</button>
    </div>

    <div class="field-group grid" style="grid-template-columns:1fr 1fr;">
      <div data-secao="distancia"><span class="field-label">Distância</span><input id="m-distancia" list="dist-list" value="${s.Distancia || ''}" placeholder="Selecione o tipo ou digite"><datalist id="dist-list"></datalist></div>
      <div><span class="field-label">Nº Caixa</span><select id="m-caixa" style="width:100%;"><option value="${s.Caixa || ''}">${s.Caixa || 'Carregando...'}</option></select></div>
    </div>

    <div data-secao="tipoSaida,logica,tensao" class="field-group grid" style="grid-template-columns:1fr 1fr 1fr;">
      <div data-secao="tipoSaida"><span class="field-label">Tipo Saída</span>${selectFull('m-tipoSaida', TIPO_SAIDA_OPTS, s.TipoSaida)}</div>
      <div data-secao="logica"><span class="field-label">Lógica</span>${selectFull('m-logica', LOGICA_OPTS, s.LogicaSaida)}</div>
      <div data-secao="tensao"><span class="field-label">Tensão</span>${selectFull('m-tensao', TENSAO_OPTS, s.Tensao)}</div>
    </div>

    <div data-secao="formaComutacao">
      <div class="section-title-modal">Forma de Comutação</div>
      <div class="toggle-group" id="m-formaComutacao">
        ${FORMA_COMUTACAO_OPTS.map(f => `<button type="button" class="toggle-btn ${state.modalFormaComutacao === f ? 'active' : ''}" data-value="${f}">${f}</button>`).join('')}
      </div>
      <div style="font-size:11.5px; color:var(--text-light); margin-top:6px;">
        ${FORMA_COMUTACAO_OPTS.map(f => `${f} → ${FORMA_COMUTACAO_DESC[f]}`).join(' &nbsp;·&nbsp; ')}
      </div>
    </div>

    <div data-secao="formato">
      <div class="section-title-modal">Formato</div>
      <div class="field-group grid" id="formato-grid" style="grid-template-columns:1fr 1fr;">
        <div><span class="field-label">Formato</span><select id="m-formato" style="width:100%;">
          <option value="">Selecione...</option>
          ${(FORMATO_OPTS_POR_TIPO[s.Tipo] || FORMATO_OPTS).map(f => `<option value="${f}" ${s.Formato === f ? 'selected' : ''}>${f}</option>`).join('')}
        </select></div>
        <div id="rosca-field" class="${s.Formato === 'Cilíndrico roscado' ? '' : 'hidden'}"><span class="field-label">Rosca</span>${selectFull('m-rosca', ROSCA_OPTS, s.Rosca)}</div>
      </div>
    </div>

    <div data-secao="ip,conexao" class="field-group grid" style="grid-template-columns:1fr 1fr;">
      <div data-secao="ip"><span class="field-label">IP</span>${selectFull('m-ip', IP_OPTS, s.IP)}</div>
      <div data-secao="conexao"><span class="field-label">Conexão</span>${selectFull('m-conexao', CONEXAO_OPTS_POR_TIPO[s.Tipo] || CONEXAO_OPTS, s.Conexao)}</div>
    </div>

    <div data-secao="material,aplicacao" class="field-group grid" style="grid-template-columns:1fr 1fr;">
      <div data-secao="material"><span class="field-label">Material</span>${selectFull('m-material', MATERIAL_OPTS, s.Material)}</div>
      <div data-secao="aplicacao"><span class="field-label">Aplicação</span>${selectFull('m-aplicacao', APLICACAO_OPTS, s.Aplicacao)}</div>
    </div>

    <div data-secao="genero,pinos,cabeca" class="field-group grid" style="grid-template-columns:1fr 1fr 1fr;">
      <div data-secao="genero"><span class="field-label">Macho / Fêmea</span>${selectFull('m-genero', GENERO_OPTS, s.Genero)}</div>
      <div data-secao="pinos"><span class="field-label">Quantidade de pinos</span>${selectFull('m-pinos', PINOS_OPTS, s.Pinos)}</div>
      <div data-secao="cabeca"><span class="field-label">Cabeça</span>${selectFull('m-cabeca', CABECA_OPTS, s.Cabeca)}</div>
    </div>

    <div data-secao="tamanho" class="field-group">
      <span class="field-label">Tamanho</span>
      <input id="m-tamanho" list="tamanho-list" value="${s.Tamanho || ''}" placeholder="Ex: 81mm, 20x20, 2 Metros...">
      <datalist id="tamanho-list"></datalist>
    </div>

    <div data-secao="papel,par" class="field-group grid" style="grid-template-columns:1fr 1.5fr;">
      <div data-secao="papel"><span class="field-label">Emissor / Receptor</span>${selectFull('m-papel', PAPEL_BARREIRA_OPTS, s.Papel)}</div>
      <div data-secao="par">
        <span class="field-label">Par vinculado (${s.Papel === 'Emissor' ? 'receptor' : s.Papel === 'Receptor' ? 'emissor' : 'outro sensor'} correspondente)</span>
        <select id="m-par" style="width:100%;"><option value="">Carregando...</option></select>
      </div>
    </div>

    <div data-secao="recursos">
      <div class="section-title-modal">Recursos</div>
      <div class="toggle-group" id="m-recursos">
        ${RECURSOS_OPTS.map(r => `<button type="button" class="toggle-btn ${state.modalRecursos.includes(r) ? 'active' : ''}" data-value="${r}">${r}</button>`).join('')}
      </div>
    </div>

    <div id="cilindro-section" data-secao="cilindro" class="${s.Tipo === 'Sensor para Cilindro Pneumático' ? '' : 'hidden'}">
      <div class="section-title-modal">Cilindro</div>
      <div class="field-group grid" style="grid-template-columns:1fr 1fr 1fr;">
        <div><span class="field-label">Tipo</span>${selectFull('m-cilindroTipo', CILINDRO_TIPO_OPTS, s.CilindroTipo)}</div>
        <div><span class="field-label">Montagem</span>${selectFull('m-cilindroMontagem', CILINDRO_MONTAGEM_OPTS, s.CilindroMontagem)}</div>
        <div><span class="field-label">Fios</span>${selectFull('m-cilindroFios', CILINDRO_FIOS_OPTS, s.CilindroFios)}</div>
      </div>
    </div>
  `;
}

function selectFull(id, options, selected) {
  return `<select id="${id}" style="width:100%;"><option value="">Selecione...</option>${options.map(o => `<option value="${o}" ${selected === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
}

function wireModalEvents(sensor) {
  const tipoSelect = document.getElementById('m-tipo');
  const distList = document.getElementById('dist-list');

  // Preview instantâneo das imagens escolhidas (antes mesmo de salvar)
  document.getElementById('m-logo-marca-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const preview = document.getElementById('preview-logo-marca');
    preview.style.background = '#f6f6f6';
    preview.innerHTML = `<img src="${URL.createObjectURL(file)}" style="width:100%; height:100%; object-fit:contain;">`;
  });
  document.getElementById('m-foto-sensor-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const preview = document.getElementById('preview-foto-sensor');
    preview.style.background = '#f6f6f6';
    preview.innerHTML = `<img src="${URL.createObjectURL(file)}" style="width:100%; height:100%; object-fit:cover;">`;
  });

  // Mostra só as seções relevantes pro tipo selecionado. Tipos que não têm
  // uma entrada em CAMPOS_POR_TIPO mostram o formulário completo (padrão).
  function aplicarCamposPorTipo() {
    // Sem tipo selecionado: não mostra NENHUM campo extra (só os básicos).
    // Com tipo selecionado mas sem entrada em CAMPOS_POR_TIPO: mostra tudo
    // (mantém sensores antigos de tipos "legados" funcionando).
    const camposVisiveis = tipoSelect.value === '' ? [] : (CAMPOS_POR_TIPO[tipoSelect.value] || null);
    document.querySelectorAll('[data-secao]').forEach(el => {
      const secoes = el.dataset.secao.split(',');
      const mostrar = camposVisiveis === null || secoes.some(s => camposVisiveis.includes(s));
      el.classList.toggle('hidden', !mostrar);
    });

    // Troca as opções do campo Formato conforme o tipo (ex: Conectores usa Reto/90°)
    const formatoSelect = document.getElementById('m-formato');
    const opcoesFormato = FORMATO_OPTS_POR_TIPO[tipoSelect.value] || FORMATO_OPTS;
    const valorAtualFormato = formatoSelect.value;
    formatoSelect.innerHTML = `<option value="">Selecione...</option>${opcoesFormato.map(f => `<option value="${f}" ${valorAtualFormato === f ? 'selected' : ''}>${f}</option>`).join('')}`;
    document.getElementById('rosca-field').classList.toggle('hidden', formatoSelect.value !== 'Cilíndrico roscado');

    // Troca as opções do campo Conexão conforme o tipo (ex: Cabo de Sensor)
    const conexaoSelect = document.getElementById('m-conexao');
    const opcoesConexao = CONEXAO_OPTS_POR_TIPO[tipoSelect.value] || CONEXAO_OPTS;
    const valorAtualConexao = conexaoSelect.value;
    conexaoSelect.innerHTML = `<option value="">Selecione...</option>${opcoesConexao.map(c => `<option value="${c}" ${valorAtualConexao === c ? 'selected' : ''}>${c}</option>`).join('')}`;
  }

  function atualizarDistancia() {
    const opts = DISTANCIA_MAP[tipoSelect.value] || [];
    distList.innerHTML = opts.map(d => `<option value="${d}">`).join('');
    document.getElementById('cilindro-section').classList.toggle('hidden',
      tipoSelect.value !== 'Sensor para Cilindro Pneumático');

    const opcoesTamanho = TAMANHO_OPTS_POR_TIPO[tipoSelect.value] || [];
    document.getElementById('tamanho-list').innerHTML = opcoesTamanho.map(t => `<option value="${t}">`).join('');
  }

  // Carrega a lista de sensores do mesmo tipo pra escolher como "par"
  // (usado por tipos como Sensor de Barreira, emissor <-> receptor)
  async function atualizarParSelect() {
    const parSelect = document.getElementById('m-par');
    if (!parSelect) return;
    const camposTipo = CAMPOS_POR_TIPO[tipoSelect.value] || [];
    if (!camposTipo.includes('par')) return;

    parSelect.innerHTML = '<option value="">Carregando...</option>';
    try {
      const candidatos = await Api.listarSensores({ tipo: tipoSelect.value });
      const idAtual = state.editSensorId;
      const opcoes = candidatos.filter(c => c.Id !== idAtual);
      const parSelecionadoAtual = idAtual ? sensor.ParSensorId : null;
      parSelect.innerHTML = '<option value="">Nenhum</option>' + opcoes.map(c =>
        `<option value="${c.Id}" ${parSelecionadoAtual === c.Id ? 'selected' : ''}>${c.Caixa ? 'Cx ' + c.Caixa + ' — ' : ''}${c.Nome}${c.Papel ? ' — ' + c.Papel : ''}</option>`
      ).join('');
    } catch (err) {
      parSelect.innerHTML = '<option value="">Erro ao carregar</option>';
    }
  }

  // Carrega a lista de números de caixa ainda livres (1 a 200), pra você
  // escolher em vez de digitar e correr risco de repetir um número em uso.
  async function carregarCaixasDisponiveis() {
    const caixaSelect = document.getElementById('m-caixa');
    caixaSelect.innerHTML = '<option value="">Carregando...</option>';
    try {
      const usadas = await Api.listarCaixas();
      const usadasSet = new Set(usadas.filter(Boolean));
      const valorAtual = sensor.Caixa || '';
      // Se está editando de verdade (não duplicando), a própria caixa não
      // deve contar como "ocupada" — senão ela mesma sumiria da lista
      if (state.editSensorId && valorAtual) usadasSet.delete(valorAtual);

      const disponiveis = [];
      for (let n = 1; n <= 200; n++) {
        const num = String(n).padStart(3, '0');
        if (!usadasSet.has(num)) disponiveis.push(num);
      }
      // Garante que o valor atual apareça mesmo se estiver fora do padrão
      // "3 dígitos" (ex: uma caixa antiga cadastrada só como "8")
      let opcoes = disponiveis;
      if (valorAtual && !opcoes.includes(valorAtual)) opcoes = [valorAtual, ...opcoes];

      caixaSelect.innerHTML = '<option value="">Selecione...</option>' +
        opcoes.map(c => `<option value="${c}" ${valorAtual === c ? 'selected' : ''}>${c}</option>`).join('');
    } catch (err) {
      caixaSelect.innerHTML = `<option value="${sensor.Caixa || ''}">${sensor.Caixa || 'Erro ao carregar'}</option>`;
    }
  }

  atualizarDistancia();
  aplicarCamposPorTipo();
  atualizarParSelect();
  carregarCaixasDisponiveis();
  tipoSelect.addEventListener('change', () => {
    atualizarDistancia();
    aplicarCamposPorTipo();
    atualizarParSelect();
  });

  // Mostra/esconde o campo Rosca sempre que o Formato mudar diretamente
  // (não só quando o Tipo muda)
  document.getElementById('m-formato').addEventListener('change', (e) => {
    document.getElementById('rosca-field').classList.toggle('hidden', e.target.value !== 'Cilíndrico roscado');
  });

  document.getElementById('btn-novo-tipo').addEventListener('click', async () => {
    const nome = prompt('Nome do novo tipo de sensor:');
    if (!nome || !nome.trim()) return;
    try {
      await Api.criarTipo(nome.trim());
      await carregarTipos();
      const valorAtual = tipoSelect.value;
      tipoSelect.innerHTML = `<option value="">Selecione...</option>${state.tiposSensores.map(t => `<option value="${t}" ${t === nome.trim() ? 'selected' : ''}>${t}</option>`).join('')}`;
      atualizarDistancia();
      aplicarCamposPorTipo();
      atualizarParSelect();
    } catch (err) {
      showError(err.message.toLowerCase().includes('duplicate') || err.message.toLowerCase().includes('unique')
        ? 'Esse tipo já existe.' : err.message);
    }
  });

  document.querySelectorAll('#m-formaComutacao .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.modalFormaComutacao = btn.dataset.value;
      document.querySelectorAll('#m-formaComutacao .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.querySelectorAll('#m-recursos .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.value;
      if (state.modalRecursos.includes(val)) {
        state.modalRecursos = state.modalRecursos.filter(r => r !== val);
        btn.classList.remove('active');
      } else {
        state.modalRecursos.push(val);
        btn.classList.add('active');
      }
    });
  });

  document.getElementById('btn-cancelar').onclick = closeModal;
  document.getElementById('btn-salvar').onclick = salvarSensor;
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ============================================================
// MODAL DE CONSULTA: Vínculo Emissor / Receptor (só leitura)
// ============================================================
async function abrirConsultaPar(sensorId) {
  try {
    const sensor = await Api.buscarSensor(sensorId);
    if (!sensor.ParSensorId) {
      showError('Esse sensor ainda não tem um par vinculado.');
      return;
    }
    const par = await Api.buscarSensor(sensor.ParSensorId);

    // Decide quem fica à esquerda (Emissor) e à direita (Receptor)
    let esquerda = sensor, direita = par;
    if (sensor.Papel === 'Receptor' && par.Papel === 'Emissor') {
      esquerda = par; direita = sensor;
    }

    document.getElementById('consulta-content').innerHTML = `
      <div style="display:flex; gap:20px;">
        ${consultaColunaHtml(esquerda, esquerda.Papel || 'Lado A')}
        ${consultaColunaHtml(direita, direita.Papel || 'Lado B')}
      </div>
    `;
    document.getElementById('consulta-overlay').classList.remove('hidden');
  } catch (err) {
    showError(err.message);
  }
}

function consultaColunaHtml(s, papelLabel) {
  const specs = [s.Tipo, s.Distancia, s.TipoSaida, s.Formato, s.IP, s.Conexao, s.Material, s.Aplicacao].filter(Boolean);
  return `
    <div style="flex:1; border:1px solid var(--border); border-radius:8px; padding:16px;">
      <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--accent); margin-bottom:10px;">${papelLabel}</div>
      <div style="display:flex; gap:12px; margin-bottom:12px;">
        <div style="width:70px; height:70px; border-radius:6px; overflow:hidden; background:#f0f0f0; flex-shrink:0;">
          ${s.FotoUrl ? `<img src="${s.FotoUrl}" style="width:100%; height:100%; object-fit:contain;">` : ''}
        </div>
        <div>
          <div style="font-weight:700; font-size:14px;">${s.Nome}</div>
          <div style="font-size:12px; color:var(--text-light);">Caixa ${s.Caixa || '—'}</div>
          <div style="display:flex; align-items:center; gap:4px; margin-top:4px;">
            ${s.MarcaLogoUrl ? `<img src="${s.MarcaLogoUrl}" style="width:18px; height:18px; object-fit:contain;">` : ''}
            <span style="font-size:12px; color:var(--text-light);">${s.Marca || '—'}</span>
          </div>
        </div>
      </div>
      <div style="font-size:12px; color:var(--text-light); margin-bottom:2px;">Cód. Fabricante: <b style="color:var(--text-dark);">${s.CodFabricante || '—'}</b></div>
      <div style="font-size:12px; color:var(--text-light); margin-bottom:10px;">Cód. DV: <b style="color:var(--text-dark);">${s.CodDV || '—'}</b></div>
      <div style="display:flex; flex-wrap:wrap; gap:4px;">
        ${specs.map(sp => `<span class="badge">${sp}</span>`).join('')}
      </div>
    </div>
  `;
}

document.getElementById('btn-fechar-consulta').addEventListener('click', () => {
  document.getElementById('consulta-overlay').classList.add('hidden');
});

async function salvarSensor() {
  const val = (id) => document.getElementById(id)?.value || null;
  const btnSalvar = document.getElementById('btn-salvar');

  btnSalvar.disabled = true;
  btnSalvar.textContent = 'Salvando...';

  try {
    // Faz upload das imagens escolhidas (se houver) antes de gravar o sensor
    const arquivoLogo = document.getElementById('m-logo-marca-file').files[0];
    const arquivoFoto = document.getElementById('m-foto-sensor-file').files[0];

    let marcaLogoUrl = state.modalMarcaLogoUrl;
    let fotoUrl = state.modalFotoUrl;

    if (arquivoLogo) marcaLogoUrl = await Api.enviarImagem(arquivoLogo, 'logos');
    if (arquivoFoto) fotoUrl = await Api.enviarImagem(arquivoFoto, 'sensores');

    const dados = {
      Nome: val('m-nome'),
      CodFabricante: val('m-codFabricante'),
      CodDV: val('m-codDV'),
      Marca: val('m-marca'),
      Estoque: parseInt(val('m-estoque')) || 0,
      Tipo: val('m-tipo'),
      Distancia: val('m-distancia'),
      Caixa: val('m-caixa'),
      TipoSaida: val('m-tipoSaida'),
      LogicaSaida: val('m-logica'),
      Tensao: val('m-tensao'),
      FormaComutacao: state.modalFormaComutacao || null,
      Formato: val('m-formato'),
      Rosca: val('m-rosca'),
      IP: val('m-ip'),
      Conexao: val('m-conexao'),
      Material: val('m-material'),
      Aplicacao: val('m-aplicacao'),
      CilindroTipo: val('m-cilindroTipo'),
      CilindroMontagem: val('m-cilindroMontagem'),
      CilindroFios: val('m-cilindroFios'),
      Genero: val('m-genero'),
      Pinos: val('m-pinos'),
      Cabeca: val('m-cabeca'),
      Tamanho: val('m-tamanho'),
      Papel: val('m-papel'),
      MarcaLogoUrl: marcaLogoUrl,
      FotoUrl: fotoUrl,
      Recursos: state.modalRecursos
    };

    if (!dados.Nome) {
      showError('Informe o nome do sensor.');
      return;
    }

    let sensorId = state.editSensorId;
    if (sensorId) {
      await Api.atualizarSensor(sensorId, dados);
    } else {
      const resultado = await Api.criarSensor(dados);
      sensorId = resultado.id;
    }

    // Se o campo de par estiver visível pra esse tipo, aplica o vínculo
    // (nos dois sentidos: sensor <-> par)
    const campoPar = document.getElementById('m-par');
    if (campoPar && !campoPar.closest('[data-secao="par"]').classList.contains('hidden')) {
      await Api.vincularPar(sensorId, campoPar.value || null);
    }

    closeModal();
    render();
  } catch (err) {
    showError(err.message);
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = 'Salvar Sensor';
  }
}

// ============================================================
// PÁGINA: Movimentação
// ============================================================
async function renderMovimentacao() {
  const [sensores, estrutura, movimentacoes] = await Promise.all([
    Api.listarSensores(), Api.listarEstrutura(), Api.listarMovimentacoes(30)
  ]);
  state.sensores = sensores;
  state.estrutura = estrutura;
  state.movimentacoes = movimentacoes;

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Movimentação</h1>
        <div class="page-subtitle">Registrar entrada ou saída de sensores por crachá</div>
      </div>
    </div>

    <div class="card">
      <div class="mov-toggle">
        <button type="button" class="entrada active" id="btn-entrada">Entrada</button>
        <button type="button" class="saida" id="btn-saida">Saída</button>
      </div>

      <div class="field-group grid" style="grid-template-columns:2fr 1fr 1fr;">
        <div><span class="field-label">Sensor</span>
          <select id="mv-sensor" style="width:100%;">
            <option value="">Selecione...</option>
            ${sensores.map(s => `<option value="${s.Id}">${s.Nome} (estoque: ${s.Estoque})</option>`).join('')}
          </select>
        </div>
        <div><span class="field-label">Quantidade</span><input id="mv-qtd" type="number" value="1" min="1"></div>
        <div><span class="field-label">Crachá</span><input id="mv-cracha" placeholder="Nº do crachá"></div>
      </div>

      <div id="destino-fields" class="field-group grid" style="grid-template-columns:1fr 1fr 1fr;">
        <div><span class="field-label">Setor</span><select id="mv-setor" style="width:100%;"><option value="">Selecione...</option>${estrutura.map(s => `<option value="${s.Id}">${s.Nome}</option>`).join('')}</select></div>
        <div><span class="field-label">Linha</span><select id="mv-linha" style="width:100%;"><option value="">Selecione o setor</option></select></div>
        <div><span class="field-label">Máquina</span><select id="mv-maquina" style="width:100%;"><option value="">Selecione a linha</option></select></div>
      </div>

      <button class="btn-primary" id="btn-registrar">Registrar movimentação</button>
    </div>

    <div class="card">
      <div class="section-title" style="margin-bottom:12px;">Últimas movimentações</div>
      ${movimentacoes.length === 0 ? '<div class="empty-state">Nenhuma movimentação registrada ainda.</div>' : `
      <ul class="mov-list">
        ${movimentacoes.map(m => `
          <li>
            <span><span class="mov-tag ${m.Tipo}">${m.Tipo === 'entrada' ? 'ENTRADA' : 'SAÍDA'}</span> &nbsp;${m.SensorNome} — Qtd ${m.Quantidade} — Crachá ${m.Cracha}${m.MaquinaNome ? ` — ${m.SetorNome} / ${m.LinhaNome} / ${m.MaquinaNome}` : ''}</span>
            <span style="color:var(--text-light);">${new Date(m.DataHora).toLocaleString('pt-BR')}</span>
          </li>
        `).join('')}
      </ul>`}
    </div>
  `;

  let tipoMov = 'entrada';
  const btnEntrada = document.getElementById('btn-entrada');
  const btnSaida = document.getElementById('btn-saida');
  const destinoFields = document.getElementById('destino-fields');

  function atualizarToggle() {
    btnEntrada.classList.toggle('active', tipoMov === 'entrada');
    btnSaida.classList.toggle('active', tipoMov === 'saida');
    destinoFields.classList.toggle('hidden', tipoMov !== 'saida');
  }
  atualizarToggle();
  btnEntrada.addEventListener('click', () => { tipoMov = 'entrada'; atualizarToggle(); });
  btnSaida.addEventListener('click', () => { tipoMov = 'saida'; atualizarToggle(); });

  const setorSelect = document.getElementById('mv-setor');
  const linhaSelect = document.getElementById('mv-linha');
  const maquinaSelect = document.getElementById('mv-maquina');

  setorSelect.addEventListener('change', () => {
    const setor = estrutura.find(s => String(s.Id) === setorSelect.value);
    linhaSelect.innerHTML = `<option value="">Selecione...</option>${(setor?.Linhas || []).map(l => `<option value="${l.Id}">${l.Nome}</option>`).join('')}`;
    maquinaSelect.innerHTML = `<option value="">Selecione a linha</option>`;
  });
  linhaSelect.addEventListener('change', () => {
    const setor = estrutura.find(s => String(s.Id) === setorSelect.value);
    const linha = setor?.Linhas.find(l => String(l.Id) === linhaSelect.value);
    maquinaSelect.innerHTML = `<option value="">Selecione...</option>${(linha?.Maquinas || []).map(m => `<option value="${m.Id}">${m.Nome}</option>`).join('')}`;
  });

  document.getElementById('btn-registrar').addEventListener('click', async () => {
    const sensorId = document.getElementById('mv-sensor').value;
    const cracha = document.getElementById('mv-cracha').value;
    const qtd = document.getElementById('mv-qtd').value;

    if (!sensorId || !cracha) {
      showError('Selecione o sensor e informe o crachá.');
      return;
    }

    try {
      const resultado = await Api.registrarMovimentacao({
        SensorId: sensorId,
        Tipo: tipoMov,
        Quantidade: qtd,
        Cracha: cracha,
        SetorId: tipoMov === 'saida' ? setorSelect.value : null,
        LinhaId: tipoMov === 'saida' ? linhaSelect.value : null,
        MaquinaId: tipoMov === 'saida' ? maquinaSelect.value : null
      });
      showSuccess(`Movimentação registrada! Novo estoque: ${resultado.novoEstoque}.`);
      render();
    } catch (err) {
      showError(err.message);
    }
  });
}

// ============================================================
// PÁGINA: Estrutura (Setores / Linhas / Máquinas)
// ============================================================
async function renderEstrutura() {
  state.estrutura = await Api.listarEstrutura();
  const content = document.getElementById('page-content');

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Setores / Linhas / Máquinas</h1>
        <div class="page-subtitle">Estrutura da fábrica usada nas saídas de sensores</div>
      </div>
    </div>

    <div class="card">
      <div class="section-title" style="margin-bottom:12px;">Novo setor</div>
      <div style="display:flex; gap:10px;">
        <input id="novo-setor" placeholder="Nome do setor" style="flex:1;">
        <button class="btn-primary" id="btn-add-setor">Adicionar</button>
      </div>
    </div>

    ${state.estrutura.map(setorHtml).join('') || '<div class="empty-state">Nenhum setor cadastrado ainda.</div>'}
  `;

  document.getElementById('btn-add-setor').addEventListener('click', async () => {
    const nome = document.getElementById('novo-setor').value;
    if (!nome) return;
    try { await Api.criarSetor(nome); render(); } catch (err) { showError(err.message); }
  });

  content.querySelectorAll('[data-del-setor]').forEach(b => b.addEventListener('click', async () => {
    if (confirm('Remover setor?')) { try { await Api.removerSetor(b.dataset.delSetor); render(); } catch (err) { showError(err.message); } }
  }));
  content.querySelectorAll('[data-del-linha]').forEach(b => b.addEventListener('click', async () => {
    if (confirm('Remover linha?')) { try { await Api.removerLinha(b.dataset.delLinha); render(); } catch (err) { showError(err.message); } }
  }));
  content.querySelectorAll('[data-del-maquina]').forEach(b => b.addEventListener('click', async () => {
    if (confirm('Remover máquina?')) { try { await Api.removerMaquina(b.dataset.delMaquina); render(); } catch (err) { showError(err.message); } }
  }));
  content.querySelectorAll('[data-add-linha]').forEach(b => b.addEventListener('click', async () => {
    const input = document.getElementById(`nova-linha-${b.dataset.addLinha}`);
    if (!input.value) return;
    try { await Api.criarLinha(b.dataset.addLinha, input.value); render(); } catch (err) { showError(err.message); }
  }));
  content.querySelectorAll('[data-add-maquina]').forEach(b => b.addEventListener('click', async () => {
    const input = document.getElementById(`nova-maquina-${b.dataset.addMaquina}`);
    if (!input.value) return;
    try { await Api.criarMaquina(b.dataset.addMaquina, input.value); render(); } catch (err) { showError(err.message); }
  }));
}

function setorHtml(setor) {
  return `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div style="font-weight:700; font-size:14px;">${setor.Nome}</div>
        <button class="btn-icon danger" data-del-setor="${setor.Id}" title="Remover setor">×</button>
      </div>
      <div style="display:flex; gap:10px; margin-bottom:14px;">
        <input id="nova-linha-${setor.Id}" placeholder="Nova linha" style="flex:1;">
        <button class="btn-secondary" data-add-linha="${setor.Id}">+ Linha</button>
      </div>
      ${(setor.Linhas || []).map(linha => `
        <div style="margin-left:16px; padding:10px; background:#fafafa; border-radius:6px; margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-weight:600; font-size:13px;">${linha.Nome}</div>
            <button class="btn-icon danger" data-del-linha="${linha.Id}" title="Remover linha">×</button>
          </div>
          <div style="display:flex; gap:8px; margin-bottom:8px;">
            <input id="nova-maquina-${linha.Id}" placeholder="Nova máquina" style="flex:1; font-size:12px;">
            <button class="btn-secondary" data-add-maquina="${linha.Id}" style="font-size:12px; padding:6px 10px;">+ Máquina</button>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${(linha.Maquinas || []).map(m => `<span class="badge">${m.Nome} <span data-del-maquina="${m.Id}" style="cursor:pointer; color:var(--warning); margin-left:4px;">×</span></span>`).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================
// PÁGINA: Dashboard
// ============================================================
async function renderDashboard() {
  state.kpis = await Api.buscarKpis();
  const content = document.getElementById('page-content');
  const k = state.kpis;

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <div class="page-subtitle">Visão geral do estoque e movimentação</div>
      </div>
    </div>

    <div class="kpi-row">
      <div class="kpi-card"><div class="kpi-value">${k.totalSensores}</div><div class="kpi-label">Sensores cadastrados</div></div>
      <div class="kpi-card"><div class="kpi-value">${k.totalEstoque}</div><div class="kpi-label">Itens em estoque</div></div>
      <div class="kpi-card"><div class="kpi-value">${k.porTipo.length}</div><div class="kpi-label">Tipos diferentes</div></div>
    </div>

    <div class="card">
      <div class="section-title" style="margin-bottom:12px;">Sensores por tipo</div>
      ${k.porTipo.length === 0 ? '<div class="empty-state">Sem dados ainda.</div>' : k.porTipo.map(t => `
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
          <div style="width:160px; font-size:13px;">${t.Tipo || 'Sem tipo'}</div>
          <div style="flex:1; background:#f0f0f0; border-radius:4px; height:18px; overflow:hidden;">
            <div style="width:${(t.quantidade / k.totalSensores * 100) || 0}%; background:var(--accent); height:100%;"></div>
          </div>
          <div style="width:30px; text-align:right; font-size:13px;">${t.quantidade}</div>
        </div>
      `).join('')}
    </div>

    <div class="card">
      <div class="section-title" style="margin-bottom:12px;">Movimentações (últimos 30 dias)</div>
      ${k.movimentosPorDia.length === 0 ? '<div class="empty-state">Nenhuma movimentação no período.</div>' : `
      <table>
        <thead><tr><th>Dia</th><th>Tipo</th><th>Total</th></tr></thead>
        <tbody>
          ${k.movimentosPorDia.map(m => `<tr><td>${new Date(m.Dia).toLocaleDateString('pt-BR')}</td><td><span class="mov-tag ${m.Tipo}">${m.Tipo}</span></td><td>${m.Total}</td></tr>`).join('')}
        </tbody>
      </table>`}
    </div>
  `;
}

// ============================================================
// Inicialização
// ============================================================
render();
