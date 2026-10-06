// ============================================================
// Mapeamento entre nomes usados na tela (PascalCase) e as
// colunas do banco no Supabase/Postgres (snake_case)
// ============================================================
const CAMPO_MAP = {
  Nome: 'nome', Tipo: 'tipo', CodFabricante: 'cod_fabricante', CodDV: 'cod_dv',
  Marca: 'marca', Caixa: 'caixa', Estoque: 'estoque', Distancia: 'distancia',
  TipoSaida: 'tipo_saida', LogicaSaida: 'logica_saida', Tensao: 'tensao',
  FormaComutacao: 'forma_comutacao', Formato: 'formato', Rosca: 'rosca',
  IP: 'ip', Conexao: 'conexao', Material: 'material', Aplicacao: 'aplicacao',
  CilindroTipo: 'cilindro_tipo', CilindroMontagem: 'cilindro_montagem',
  CilindroFios: 'cilindro_fios', FotoUrl: 'foto_url', Genero: 'genero', MarcaLogoUrl: 'marca_logo_url', Pinos: 'pinos', Tamanho: 'tamanho',
  Papel: 'papel', ParSensorId: 'par_sensor_id', Cabeca: 'cabeca'
};

function paraColuna(dadosPascal) {
  const linha = {};
  Object.entries(CAMPO_MAP).forEach(([pascal, coluna]) => {
    if (dadosPascal[pascal] !== undefined) linha[coluna] = dadosPascal[pascal];
  });
  return linha;
}

function paraPascal(linha) {
  if (!linha) return linha;
  const obj = { Id: linha.id };
  Object.entries(CAMPO_MAP).forEach(([pascal, coluna]) => {
    obj[pascal] = linha[coluna];
  });
  return obj;
}

async function checarErro(promise, mensagemPadrao) {
  const { data, error } = await promise;
  if (error) {
    if (error.message && error.message.includes('sensores_caixa_key')) {
      throw new Error('Esse número de caixa já está em uso por outro sensor. Escolha um número diferente.');
    }
    throw new Error(error.message || mensagemPadrao);
  }
  return data;
}

const Api = {
  // ---------- Sensores ----------
  async listarSensores(filtros = {}) {
    let query = supabaseClient.from('sensores').select('*, par_sensor:par_sensor_id(caixa)').order('caixa', { ascending: true, nullsFirst: false });

    const mapaFiltros = {
      tipo: 'tipo', distancia: 'distancia', tipoSaida: 'tipo_saida',
      logica: 'logica_saida', tensao: 'tensao', formato: 'formato',
      rosca: 'rosca', ip: 'ip', conexao: 'conexao', material: 'material',
      aplicacao: 'aplicacao', formaComutacao: 'forma_comutacao', genero: 'genero', pinos: 'pinos', tamanho: 'tamanho', papel: 'papel', cabeca: 'cabeca'
    };
    Object.entries(mapaFiltros).forEach(([key, coluna]) => {
      if (filtros[key]) query = query.eq(coluna, filtros[key]);
    });

    // Caixa usa "contém" em vez de "igual exato", pra "83" encontrar "083"
    // (e também aceitar buscas parciais, como já acontece no campo de busca)
    if (filtros.caixa) {
      query = query.ilike('caixa', `%${filtros.caixa.replace(/^0+/, '') || filtros.caixa}%`);
    }

    // Recursos é uma relação N:N (um sensor pode ter vários) — busca antes
    // quais sensores têm esse recurso, e filtra a consulta principal por ID
    if (filtros.recursos) {
      const comRecurso = await checarErro(
        supabaseClient.from('sensor_recursos').select('sensor_id').eq('recurso', filtros.recursos),
        'Erro ao buscar recursos'
      );
      const idsComRecurso = comRecurso.map(r => r.sensor_id);
      query = query.in('id', idsComRecurso.length > 0 ? idsComRecurso : [0]);
    }

    if (filtros.busca) {
      query = query.or(`nome.ilike.%${filtros.busca}%,marca.ilike.%${filtros.busca}%,cod_fabricante.ilike.%${filtros.busca}%`);
    }

    const linhas = await checarErro(query, 'Erro ao buscar sensores');
    const sensores = linhas.map(l => ({ ...paraPascal(l), ParCaixa: l.par_sensor ? l.par_sensor.caixa : null }));

    // Busca recursos de todos os sensores retornados
    if (sensores.length > 0) {
      const ids = sensores.map(s => s.Id);
      const recursos = await checarErro(
        supabaseClient.from('sensor_recursos').select('*').in('sensor_id', ids),
        'Erro ao buscar recursos'
      );
      sensores.forEach(s => {
        s.Recursos = recursos.filter(r => r.sensor_id === s.Id).map(r => r.recurso);
      });
    }
    return sensores;
  },

  async buscarSensor(id) {
    const linha = await checarErro(
      supabaseClient.from('sensores').select('*').eq('id', id).single(),
      'Sensor não encontrado'
    );
    const sensor = paraPascal(linha);
    const recursos = await checarErro(
      supabaseClient.from('sensor_recursos').select('recurso').eq('sensor_id', id),
      'Erro ao buscar recursos'
    );
    sensor.Recursos = recursos.map(r => r.recurso);
    return sensor;
  },

  async criarSensor(dados) {
    const linha = paraColuna(dados);
    const novo = await checarErro(
      supabaseClient.from('sensores').insert(linha).select().single(),
      'Erro ao criar sensor'
    );
    const recursos = Array.isArray(dados.Recursos) ? dados.Recursos : [];
    if (recursos.length > 0) {
      await checarErro(
        supabaseClient.from('sensor_recursos').insert(recursos.map(r => ({ sensor_id: novo.id, recurso: r }))),
        'Erro ao salvar recursos'
      );
    }
    return { id: novo.id };
  },

  async atualizarSensor(id, dados) {
    const linha = paraColuna(dados);
    linha.atualizado_em = new Date().toISOString();
    await checarErro(
      supabaseClient.from('sensores').update(linha).eq('id', id),
      'Erro ao atualizar sensor'
    );
    await checarErro(
      supabaseClient.from('sensor_recursos').delete().eq('sensor_id', id),
      'Erro ao atualizar recursos'
    );
    const recursos = Array.isArray(dados.Recursos) ? dados.Recursos : [];
    if (recursos.length > 0) {
      await checarErro(
        supabaseClient.from('sensor_recursos').insert(recursos.map(r => ({ sensor_id: id, recurso: r }))),
        'Erro ao salvar recursos'
      );
    }
    return { mensagem: 'Sensor atualizado com sucesso' };
  },

  async removerSensor(id) {
    await checarErro(supabaseClient.from('sensores').delete().eq('id', id), 'Erro ao remover sensor');
    return { mensagem: 'Sensor removido com sucesso' };
  },

  // ---------- Vínculo de par (Sensor de Barreira: emissor <-> receptor) ----------
  // Sempre mantém o vínculo nos dois lados. Se o sensor ou o novo par já
  // tinham outro vínculo, desfaz o antigo antes de criar o novo.
  async vincularPar(sensorId, novoParId) {
    const atual = await checarErro(
      supabaseClient.from('sensores').select('par_sensor_id').eq('id', sensorId).single(),
      'Erro ao buscar sensor'
    );
    const parAntigoId = atual.par_sensor_id;

    if (parAntigoId && parAntigoId !== novoParId) {
      await checarErro(
        supabaseClient.from('sensores').update({ par_sensor_id: null }).eq('id', parAntigoId),
        'Erro ao desfazer vínculo antigo'
      );
    }

    if (novoParId) {
      // Se o sensor escolhido como novo par já tinha outro vínculo, desfaz também
      const novoPar = await checarErro(
        supabaseClient.from('sensores').select('par_sensor_id').eq('id', novoParId).single(),
        'Erro ao buscar sensor par'
      );
      if (novoPar.par_sensor_id && novoPar.par_sensor_id !== sensorId) {
        await checarErro(
          supabaseClient.from('sensores').update({ par_sensor_id: null }).eq('id', novoPar.par_sensor_id),
          'Erro ao desfazer vínculo antigo do par'
        );
      }
      await checarErro(supabaseClient.from('sensores').update({ par_sensor_id: sensorId }).eq('id', novoParId), 'Erro ao vincular par');
    }

    await checarErro(supabaseClient.from('sensores').update({ par_sensor_id: novoParId || null }).eq('id', sensorId), 'Erro ao vincular par');
    return { mensagem: 'Vínculo atualizado' };
  },

  // ---------- Upload de imagens (Supabase Storage) ----------
  async enviarImagem(arquivo, pasta) {
    const extensao = arquivo.name.split('.').pop();
    const nomeArquivo = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensao}`;
    const { error } = await supabaseClient.storage.from('sensor-images').upload(nomeArquivo, arquivo);
    if (error) throw new Error(error.message || 'Erro ao enviar imagem');
    const { data } = supabaseClient.storage.from('sensor-images').getPublicUrl(nomeArquivo);
    return data.publicUrl;
  },

  // ---------- Números de caixa em uso (pra sugerir os livres no cadastro) ----------
  async listarCaixas() {
    const linhas = await checarErro(
      supabaseClient.from('sensores').select('caixa'),
      'Erro ao buscar números de caixa'
    );
    return linhas.map(l => l.caixa).filter(Boolean);
  },

  // ---------- Tipos de sensores ----------
  async listarTipos() {
    const linhas = await checarErro(
      supabaseClient.from('tipos_sensores').select('*').order('nome'),
      'Erro ao buscar tipos de sensores'
    );
    return linhas.map(l => l.nome);
  },

  async criarTipo(nome) {
    return checarErro(
      supabaseClient.from('tipos_sensores').insert({ nome }).select().single(),
      'Erro ao criar tipo de sensor'
    );
  },

  // ---------- Estrutura (setores / linhas / máquinas) ----------
  async listarEstrutura() {
    const [setores, linhas, maquinas] = await Promise.all([
      checarErro(supabaseClient.from('setores').select('*').order('nome'), 'Erro ao buscar setores'),
      checarErro(supabaseClient.from('linhas').select('*').order('nome'), 'Erro ao buscar linhas'),
      checarErro(supabaseClient.from('maquinas').select('*').order('nome'), 'Erro ao buscar máquinas')
    ]);

    return setores.map(setor => ({
      Id: setor.id, Nome: setor.nome,
      Linhas: linhas.filter(l => l.setor_id === setor.id).map(linha => ({
        Id: linha.id, Nome: linha.nome,
        Maquinas: maquinas.filter(m => m.linha_id === linha.id).map(m => ({ Id: m.id, Nome: m.nome }))
      }))
    }));
  },

  async criarSetor(nome) {
    return checarErro(supabaseClient.from('setores').insert({ nome }).select().single(), 'Erro ao criar setor');
  },
  async removerSetor(id) {
    return checarErro(supabaseClient.from('setores').delete().eq('id', id), 'Erro ao remover setor');
  },
  async criarLinha(setorId, nome) {
    return checarErro(supabaseClient.from('linhas').insert({ setor_id: setorId, nome }).select().single(), 'Erro ao criar linha');
  },
  async removerLinha(id) {
    return checarErro(supabaseClient.from('linhas').delete().eq('id', id), 'Erro ao remover linha');
  },
  async criarMaquina(linhaId, nome) {
    return checarErro(supabaseClient.from('maquinas').insert({ linha_id: linhaId, nome }).select().single(), 'Erro ao criar máquina');
  },
  async removerMaquina(id) {
    return checarErro(supabaseClient.from('maquinas').delete().eq('id', id), 'Erro ao remover máquina');
  },

  // ---------- Movimentações ----------
  async listarMovimentacoes(limite = 50) {
    const linhas = await checarErro(
      supabaseClient
        .from('movimentacoes')
        .select('id, tipo, quantidade, cracha, data_hora, sensores(nome), setores(nome), linhas(nome), maquinas(nome)')
        .order('data_hora', { ascending: false })
        .limit(limite),
      'Erro ao buscar movimentações'
    );
    return linhas.map(m => ({
      Id: m.id, Tipo: m.tipo, Quantidade: m.quantidade, Cracha: m.cracha, DataHora: m.data_hora,
      SensorNome: m.sensores?.nome, SetorNome: m.setores?.nome, LinhaNome: m.linhas?.nome, MaquinaNome: m.maquinas?.nome
    }));
  },

  async registrarMovimentacao(dados) {
    const quantidade = parseInt(dados.Quantidade) || 1;
    const tipo = dados.Tipo;

    if (quantidade <= 0) {
      throw new Error('Informe uma quantidade válida (maior que zero).');
    }

    // Só valida o saldo pra dar uma mensagem de erro amigável antes de tentar
    // registrar. O AJUSTE do estoque em si é feito pelo trigger do banco
    // (ver schema.sql) disparado automaticamente ao inserir em "movimentacoes" —
    // NÃO atualizar o estoque manualmente aqui, senão ele é alterado duas vezes.
    const sensorAtual = await checarErro(
      supabaseClient.from('sensores').select('estoque').eq('id', dados.SensorId).single(),
      'Sensor não encontrado'
    );
    const estoqueAtual = sensorAtual.estoque || 0;

    if (tipo === 'saida' && quantidade > estoqueAtual) {
      throw new Error(`Estoque insuficiente. Disponível: ${estoqueAtual}, solicitado: ${quantidade}.`);
    }

    const linha = {
      sensor_id: dados.SensorId,
      tipo: tipo,
      quantidade: quantidade,
      cracha: dados.Cracha,
      setor_id: dados.SetorId || null,
      linha_id: dados.LinhaId || null,
      maquina_id: dados.MaquinaId || null
    };

    await checarErro(supabaseClient.from('movimentacoes').insert(linha), 'Erro ao registrar movimentação');

    // Busca o estoque já recalculado pelo trigger, pra mostrar o valor real e atual
    const sensorAtualizado = await checarErro(
      supabaseClient.from('sensores').select('estoque').eq('id', dados.SensorId).single(),
      'Erro ao conferir estoque atualizado'
    );

    return { mensagem: 'Movimentação registrada com sucesso', novoEstoque: sensorAtualizado.estoque };
  },

  chaveCotacao(sensor) {
    const norm = valor => String(valor || '').trim().toUpperCase().replace(/\s+/g, ' ');
    return sensor.CodFabricante && sensor.Marca ? norm(sensor.Marca) + '|' + norm(sensor.CodFabricante) : 'SENSOR|' + sensor.Id;
  },
  async lerCotacoes(itens) {
    const chaves = [...new Set(itens.map(s => this.chaveCotacao(s)))];
    const resultado = new Map();
    for(let i=0;i<chaves.length;i+=100) {
      const linhas = await checarErro(supabaseClient.from('cotacoes_compra').select('*').in('chave',chaves.slice(i,i+100)), 'Erro ao carregar cotações');
      linhas.forEach(c => resultado.set(c.chave,c));
    }
    return resultado;
  },
  async pesquisarPreco(sensorId) {
    const {data,error} = await supabaseClient.functions.invoke('consultar-preco',{body:{sensorId}});
    if(error) throw new Error('Falha ao consultar preço. Verifique a Edge Function e sua configuração.');
    return data;
  },
  async salvarPreco(chave,valor,automatico=false) {
    await checarErro(supabaseClient.rpc('editar_cotacao',{p_chave:chave,p_valor:valor,p_automatico:automatico}), 'Erro ao salvar cotação');
  },

  async listarCompras() {
    const fim = new Date();
    const inicio = new Date(fim);
    const dia = inicio.getDate();
    inicio.setDate(1);
    inicio.setMonth(inicio.getMonth() - 3);
    const ultimoDia = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0).getDate();
    inicio.setDate(Math.min(dia, ultimoDia));
    const dias = Math.max(1, (fim - inicio) / 86400000);
    const paginar = async (criarQuery) => {
      const resultado = [];
      for (let offset = 0; ; offset += 500) {
        const pagina = await checarErro(criarQuery().range(offset, offset + 499), 'Erro ao gerar lista de compra');
        resultado.push(...pagina);
        if (pagina.length < 500) break;
      }
      return resultado;
    };
    const sensores = await paginar(() => supabaseClient.from('sensores')
      .select('id, caixa, nome, cod_fabricante, cod_dv, marca, estoque').eq('estoque', 0).order('id'));
    const ids = new Set(sensores.map(s => String(s.id)));
    const totais = new Map();
    const comMovimentacao = new Set();
    if (sensores.length) {
      // Elegibilidade usa todo o histórico; consumo continua limitado a três meses.
      const historico = await paginar(() => supabaseClient.from('movimentacoes')
        .select('id, sensor_id').in('tipo', ['entrada', 'saida'])
        .lte('data_hora', fim.toISOString()).order('id'));
      for (const m of historico) {
        const id = String(m.sensor_id);
        if (ids.has(id)) comMovimentacao.add(id);
      }
      const saidas = await paginar(() => supabaseClient.from('movimentacoes')
        .select('id, sensor_id, quantidade, data_hora').eq('tipo', 'saida')
        .gte('data_hora', inicio.toISOString()).lte('data_hora', fim.toISOString()).order('id'));
      for (const m of saidas) {
        const id = String(m.sensor_id);
        if (!ids.has(id)) continue;
        const resumo = totais.get(id) || { total: 0, ultima: null };
        resumo.total += Math.max(0, Number(m.quantidade) || 0);
        if (m.data_hora && (!resumo.ultima || m.data_hora > resumo.ultima)) resumo.ultima = m.data_hora;
        totais.set(id, resumo);
      }
    }
    const itens = sensores.filter(s => comMovimentacao.has(String(s.id))).map(s => {
      const resumo = totais.get(String(s.id)) || { total: 0, ultima: null };
      return { ...paraPascal(s), TotalSaidas: resumo.total, UltimaSaida: resumo.ultima,
        QuantidadeSugerida: resumo.total > 0 ? Math.ceil(resumo.total / dias * 45) : null };
    }).sort((a, b) => b.TotalSaidas - a.TotalSaidas || String(a.Caixa || '').localeCompare(String(b.Caixa || ''), 'pt-BR', { numeric: true }) || String(a.Id).localeCompare(String(b.Id)));
    return { itens, inicio: inicio.toISOString(), fim: fim.toISOString(), dias };
  },

  // ---------- KPIs / Dashboard ----------
  async buscarKpis() {
    const sensores = await checarErro(supabaseClient.from('sensores').select('tipo, estoque'), 'Erro ao buscar KPIs');
    const totalSensores = sensores.length;
    const totalEstoque = sensores.reduce((soma, s) => soma + (s.estoque || 0), 0);

    const porTipoMap = {};
    sensores.forEach(s => {
      const tipo = s.tipo || 'Sem tipo';
      porTipoMap[tipo] = (porTipoMap[tipo] || 0) + 1;
    });
    const porTipo = Object.entries(porTipoMap)
      .map(([Tipo, quantidade]) => ({ Tipo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade);

    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
    const movimentos = await checarErro(
      supabaseClient.from('movimentacoes').select('tipo, quantidade, data_hora').gte('data_hora', trintaDiasAtras.toISOString()),
      'Erro ao buscar movimentações'
    );
    const porDiaMap = {};
    movimentos.forEach(m => {
      const dia = m.data_hora.slice(0, 10);
      const chave = `${dia}|${m.tipo}`;
      porDiaMap[chave] = (porDiaMap[chave] || 0) + m.quantidade;
    });
    const movimentosPorDia = Object.entries(porDiaMap)
      .map(([chave, Total]) => {
        const [Dia, Tipo] = chave.split('|');
        return { Dia, Tipo, Total };
      })
      .sort((a, b) => a.Dia.localeCompare(b.Dia));

    return { totalSensores, totalEstoque, porTipo, movimentosPorDia };
  }
};
