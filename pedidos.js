
// Pedidos de compra: módulo independente, sem alteração de estoque.
const PedidoUI = (() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const status = {rascunho:'Rascunho',aguardando:'Aguardando recebimento',parcial:'Recebido parcialmente',concluido:'Concluído',cancelado:'Cancelado'};
  const numero = p => p.numero ? 'SC-'+String(p.numero).padStart(6,'0') : 'Rascunho';
  const data = v => v ? new Date(v).toLocaleString('pt-BR') : '—';
  let atual=null, linhas=[], lista=[], ocupado=false;
  const root=()=>document.getElementById('page-content');
  async function consulta(q){const {data,error}=await q;if(error)throw new Error(error.message);return data;}
  async function operar(acao,dados={}){
    if(acao==='salvar') return consulta(supabaseClient.rpc('sc_salvar_rascunho_apelido',{p_id:atual?.id||null,p_dados:{...dados,versao:atual?.versao}}));
    if(acao==='apelido') return consulta(supabaseClient.rpc('sc_definir_apelido',{p_id:atual.id,p_versao:atual.versao,p_apelido:dados.apelido}));
    return consulta(supabaseClient.rpc('sc_operar_pedido',{p_acao:acao,p_id:atual?.id||null,p_dados:{...dados,versao:atual?.versao}}));
  }
  async function executar(fn){if(ocupado)return;ocupado=true;try{await fn();}catch(e){showError(e.message);}finally{ocupado=false;}}
  function botao(id,fn){document.getElementById(id)?.addEventListener('click',()=>executar(fn));}
  async function abrir(){
    const {data:{session},error}=await supabaseClient.auth.getSession();if(error)throw error;
    if(state.page!=='pedidos')return;
    if(!session){login();return;}
    await listar();
  }
  function login(){
    root().innerHTML=`<h1 class="page-title">Pedidos de compra</h1><div class="card pedido-login"><p>Entre para acessar o controle compartilhado de pedidos.</p><form id="pc-login"><label class="field-label" for="pc-email">E-mail</label><input id="pc-email" type="email" autocomplete="username" required><label class="field-label" for="pc-senha">Senha</label><input id="pc-senha" type="password" autocomplete="current-password" required><button class="btn-primary" type="submit">Entrar</button></form><p class="page-subtitle">Use um usuário criado pelo administrador no Supabase Authentication. Não use chaves do projeto como senha.</p></div>`;
    document.getElementById('pc-login').addEventListener('submit',e=>{e.preventDefault();executar(async()=>{
      const {error}=await supabaseClient.auth.signInWithPassword({email:document.getElementById('pc-email').value.trim(),password:document.getElementById('pc-senha').value});
      if(error)throw error;await listar();
    });});
  }
  async function listar(){
    atual=null;
    lista=[];
    for(let offset=0;;offset+=500){
      const pagina=await consulta(supabaseClient.from('sc_pedidos').select('*').order('criado_em',{ascending:false}).order('id').range(offset,offset+499));
      lista.push(...pagina);if(pagina.length<500)break;
    }
    if(state.page!=='pedidos')return;
    root().innerHTML=`<div class="page-header"><div><h1 class="page-title">Pedidos de compra</h1><div class="page-subtitle">Controle de recebimentos — não altera o estoque.</div></div><div class="pedido-acoes"><button class="btn-primary" id="pc-novo">Novo pedido</button><button class="btn-secondary" id="pc-recarregar">Atualizar</button><button class="btn-secondary" id="pc-sair">Sair do módulo</button></div></div><div class="card"><h2 style="font-size:16px;margin-top:0">Localizar item nos pedidos</h2><form id="pc-busca-item-form" class="pedido-acoes"><input id="pc-busca-item" maxlength="200" required placeholder="Nome/descrição, cód. fabricante ou DV" aria-label="Pesquisar item nos pedidos" style="width:min(100%,430px)"><select id="pc-busca-item-status" aria-label="Situação dos pedidos pesquisados"><option value="">Todas as situações</option><option value="pendentes">Somente pedidos com saldo pendente</option>${Object.entries(status).map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select><button class="btn-primary" id="pc-busca-item-enviar" type="submit">Pesquisar item</button><button class="btn-secondary" id="pc-busca-item-limpar" type="button">Limpar</button></form><p class="page-subtitle">Busca parcial nos itens salvos dos pedidos. Não pesquisa o cadastro de sensores. Filtro independente da lista abaixo.</p><div id="pc-busca-item-resultados" aria-live="polite"></div></div><div class="pedido-acoes"><input id="pc-filtro" placeholder="Buscar número interno, apelido ou P.C." aria-label="Pesquisar pedidos"><select id="pc-status" aria-label="Filtrar situação"><option value="">Todas as situações</option>${Object.entries(status).map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></div><div class="card pedido-tabela"><table><thead><tr><th>Pedido interno</th><th>Descrição / Apelido</th><th>Criado em</th><th>P.C. do sistema</th><th>Situação</th><th></th></tr></thead><tbody id="pc-lista"></tbody></table></div>`;
    prepararBuscaItens();
    const desenhar=()=>{
      const termo=document.getElementById('pc-filtro').value.trim().toLowerCase(),situacao=document.getElementById('pc-status').value;
      const filtrados=lista.filter(p=>(!situacao||p.status===situacao)&&(!termo||(numero(p)+' '+(p.apelido||'')+' '+p.pc).toLowerCase().includes(termo)));
      document.getElementById('pc-lista').innerHTML=filtrados.map(p=>`<tr><td>${esc(numero(p))}</td><td style="white-space:normal;min-width:220px;overflow-wrap:anywhere">${esc(p.apelido||'Não informado')}</td><td>${esc(data(p.criado_em))}</td><td>${esc(p.pc||'Não informado')}</td><td><span class="badge">${esc(status[p.status])}</span></td><td><button class="btn-secondary" data-pedido="${p.id}">Abrir</button></td></tr>`).join('')||'<tr><td colspan="6">Nenhum pedido encontrado.</td></tr>';
      root().querySelectorAll('[data-pedido]').forEach(b=>b.addEventListener('click',()=>executar(()=>detalhar(b.dataset.pedido))));
    };
    document.getElementById('pc-filtro').addEventListener('input',desenhar);document.getElementById('pc-status').addEventListener('change',desenhar);desenhar();
    botao('pc-novo',()=>{atual=null;linhas=[{descricao:'',cod_fabricante:'',dv:'',quantidade:1}];editar();});
    botao('pc-recarregar',listar);botao('pc-sair',async()=>{const {error}=await supabaseClient.auth.signOut();if(error)throw error;login();});
  }

  function prepararBuscaItens(){
    const form=document.getElementById('pc-busca-item-form');
    const campo=document.getElementById('pc-busca-item');
    const filtro=document.getElementById('pc-busca-item-status');
    const destino=document.getElementById('pc-busca-item-resultados');
    const enviar=document.getElementById('pc-busca-item-enviar');
    let encontrados=[], termo='', situacao='', proxima=0, fim=false, buscando=false, geracao=0;
    const pintar=()=>{
      if(!encontrados.length){destino.textContent='Nenhum item encontrado para esta pesquisa.';return;}
      const pedidos=new Set(encontrados.map(r=>r.pedido_id)).size;
      destino.innerHTML=`<p>${encontrados.length} linha(s) em ${pedidos} pedido(s) nos resultados carregados.${fim?'':' Há mais resultados.'}</p><div style="overflow:auto"><table><thead><tr><th>Pedido</th><th>Apelido / Projeto</th><th>P.C.</th><th>Nº item</th><th>Descrição</th><th>Cód. fabricante</th><th>DV</th><th>Solicitado</th><th>Recebido</th><th>Pendente</th><th>Situação</th><th></th></tr></thead><tbody>${encontrados.map(r=>`<tr><td>${esc(numero({numero:r.numero}))}</td><td>${esc(r.apelido||'Não informado')}</td><td>${esc(r.pc||'Não informado')}</td><td>${r.item}</td><td style="white-space:pre-wrap;min-width:220px">${esc(r.descricao)}</td><td>${esc(r.cod_fabricante)}</td><td>${esc(r.dv)}</td><td>${r.quantidade}</td><td>${r.recebido}</td><td>${r.pendente}</td><td>${esc(status[r.status]||r.status)}</td><td><button class="btn-secondary" type="button" data-item-pedido="${esc(r.pedido_id)}">Abrir pedido</button></td></tr>`).join('')}</tbody></table></div>${fim?'':'<button type="button" class="btn-secondary" id="pc-busca-item-mais">Carregar mais</button>'}`;
      destino.querySelectorAll('[data-item-pedido]').forEach(b=>b.addEventListener('click',()=>executar(()=>detalhar(b.dataset.itemPedido))));
      document.getElementById('pc-busca-item-mais')?.addEventListener('click',()=>buscar(false));
    };
    const buscar=async(nova)=>{
      if(buscando)return;
      if(nova){
        termo=campo.value.trim();situacao=filtro.value;
        if(!termo){campo.focus();showError('Informe nome, código do fabricante ou DV.');return;}
        encontrados=[];proxima=0;fim=false;geracao++;
      }
      const token=geracao;
      buscando=true;enviar.disabled=true;campo.disabled=true;filtro.disabled=true;
      const mais=document.getElementById('pc-busca-item-mais');if(mais)mais.disabled=true;
      if(nova)destino.textContent='Pesquisando itens...';
      try{
        const rows=await consulta(supabaseClient.rpc('sc_pesquisar_itens_pedidos',{p_termo:termo,p_status:situacao,p_offset:proxima,p_limite:100}));
        if(token!==geracao||!destino.isConnected||state.page!=='pedidos')return;
        const pagina=rows||[];const chaves=new Set(encontrados.map(r=>r.item_id));
        encontrados.push(...pagina.filter(r=>!chaves.has(r.item_id)));
        proxima+=pagina.length;fim=pagina.length<100;pintar();
      }catch(e){
        if(token===geracao&&destino.isConnected){destino.textContent='Não foi possível pesquisar. Confira se o SQL da pesquisa foi instalado e tente novamente.';showError(e.message);}
      }finally{
        buscando=false;enviar.disabled=false;campo.disabled=false;filtro.disabled=false;
        const b=document.getElementById('pc-busca-item-mais');if(b)b.disabled=false;
      }
    };
    form.addEventListener('submit',e=>{e.preventDefault();buscar(true);});
    document.getElementById('pc-busca-item-limpar').addEventListener('click',()=>{
      geracao++;encontrados=[];proxima=0;fim=false;campo.value='';filtro.value='';destino.replaceChildren();
    });
  }

  async function carregar(id){
    const p=await consulta(supabaseClient.from('sc_pedidos').select('*').eq('id',id).single());
    const itens=await consulta(supabaseClient.from('sc_pedido_itens').select('*').eq('pedido_id',id).order('item'));
    atual=p;linhas=itens;return p;
  }
  function editar(){
    root().innerHTML=`<div class="page-header"><div><h1 class="page-title">${atual?'Editar rascunho':'Novo pedido'}</h1><p class="page-subtitle">Preencha cada linha. Salve o rascunho antes de emitir.</p></div><button class="btn-secondary" id="pc-voltar">Voltar</button></div><div class="card"><label class="field-label" for="pc-apelido-rascunho">Descrição / Apelido do pedido</label><input id="pc-apelido-rascunho" maxlength="200" style="width:100%" value="${esc(atual?.apelido||'')}" placeholder="Ex.: Reforma do painel da Linha 3"></div><div class="card pedido-tabela"><table><thead><tr><th>Nº item</th><th>Descrição</th><th>Cód. fabricante</th><th>DV</th><th>Quantidade</th><th></th></tr></thead><tbody id="pc-linhas"></tbody></table></div><div class="pedido-acoes"><button class="btn-secondary" id="pc-adicionar">Adicionar linha</button><button class="btn-primary" id="pc-salvar">Salvar rascunho</button></div>`;
    desenharLinhas();
    botao('pc-voltar',async()=>{if(confirm('Voltar sem salvar as alterações desta tela?'))await listar();});
    botao('pc-adicionar',()=>{lerLinhas();if(linhas.length>=500)throw new Error('Limite de 500 itens.');linhas.push({descricao:'',cod_fabricante:'',dv:'',quantidade:1});desenharLinhas();});
    botao('pc-salvar',async()=>{
      lerLinhas();if(!linhas.length)throw new Error('Adicione pelo menos um item.');
      linhas.forEach((l,i)=>{if(!l.descricao.trim()||!Number.isSafeInteger(l.quantidade)||l.quantidade<=0)throw new Error('Revise descrição e quantidade do item '+(i+1));});
      const id=await operar('salvar',{itens:linhas,apelido:document.getElementById('pc-apelido-rascunho').value.trim()});await detalhar(id);showSuccess('Rascunho salvo.');
    });
  }
  function lerLinhas(){linhas=[...root().querySelectorAll('[data-pc-linha]')].map(tr=>({descricao:tr.querySelector('[data-campo="descricao"]').value,cod_fabricante:tr.querySelector('[data-campo="cod_fabricante"]').value,dv:tr.querySelector('[data-campo="dv"]').value,quantidade:Number(tr.querySelector('[data-campo="quantidade"]').value)}));}
  function desenharLinhas(){
    document.getElementById('pc-linhas').innerHTML=linhas.map((l,i)=>`<tr data-pc-linha><td>${i+1}</td><td><textarea data-campo="descricao" maxlength="4000" aria-label="Descrição item ${i+1}">${esc(l.descricao)}</textarea></td><td><input data-campo="cod_fabricante" maxlength="200" value="${esc(l.cod_fabricante)}" aria-label="Código fabricante item ${i+1}"></td><td><input data-campo="dv" maxlength="200" value="${esc(l.dv)}" aria-label="DV item ${i+1}"></td><td><input data-campo="quantidade" type="number" min="1" step="1" value="${esc(l.quantidade)}" aria-label="Quantidade item ${i+1}"></td><td><button class="btn-secondary" data-remover="${i}" title="Remover linha">×</button></td></tr>`).join('');
    root().querySelectorAll('[data-remover]').forEach(b=>b.addEventListener('click',()=>{lerLinhas();linhas.splice(Number(b.dataset.remover),1);desenharLinhas();}));
  }
  async function detalhar(id){
    await carregar(id);
    const historico=[];
    for(let o=0;;o+=500){const pag=await consulta(supabaseClient.from('sc_pedido_recebimentos').select('*').eq('pedido_id',id).order('recebido_em',{ascending:false}).order('id').range(o,o+499));historico.push(...pag);if(pag.length<500)break;}
    if(state.page!=='pedidos')return;
    const p=atual,aberto=['aguardando','parcial'].includes(p.status),rascunho=p.status==='rascunho';
    root().innerHTML=`<div class="page-header"><div><h1 class="page-title">${esc(numero(p))}</h1><p class="page-subtitle">${esc(status[p.status])} · Emissão: ${esc(data(p.emitido_em))}</p></div><div class="pedido-acoes"><button class="btn-secondary" id="pc-voltar">Voltar</button>${rascunho?'<button class="btn-secondary" id="pc-editar">Editar itens</button><button class="btn-primary" id="pc-emitir">Emitir pedido</button>':'<button class="btn-primary" id="pc-imprimir">Abrir documento / PDF</button>'}${!['concluido','cancelado'].includes(p.status)?'<button class="btn-secondary" id="pc-cancelar">Cancelar pedido</button>':''}</div></div>
    <div class="card"><label class="field-label" for="pc-apelido">Descrição / Apelido do pedido</label><div class="pedido-acoes"><input id="pc-apelido" maxlength="200" style="width:min(100%,600px)" value="${esc(p.apelido||'')}" placeholder="Projeto ou serviço deste pedido"><button class="btn-secondary" id="pc-gravar-apelido">Salvar apelido</button></div><label class="field-label" for="pc-numero">P.C. do seu sistema</label><div class="pedido-acoes"><input id="pc-numero" maxlength="100" value="${esc(p.pc)}" placeholder="Preencher quando disponível"><button class="btn-secondary" id="pc-gravar-numero">Salvar P.C.</button></div><p class="page-subtitle">Registrar recebimentos aqui não altera o estoque.</p></div>
    <div class="card pedido-tabela"><table><thead><tr><th>Item</th><th>Descrição</th><th>Cód. fabricante</th><th>DV</th><th>Solicitado</th><th>Recebido</th><th>Pendente</th>${aberto?'<th>Receber agora</th><th></th>':''}</tr></thead><tbody>${linhas.map(l=>`<tr><td>${l.item}</td><td class="pedido-descricao">${esc(l.descricao)}</td><td>${esc(l.cod_fabricante)}</td><td>${esc(l.dv)}</td><td>${l.quantidade}</td><td>${l.recebido}</td><td>${l.quantidade-l.recebido}</td>${aberto?`<td><input data-receber="${l.id}" type="number" min="0" max="${l.quantidade-l.recebido}" step="1" value="0" aria-label="Receber item ${l.item}" ${l.recebido===l.quantidade?'disabled':''}></td><td><button class="btn-secondary" data-saldo="${l.id}" ${l.recebido===l.quantidade?'disabled':''}>Receber saldo</button></td>`:''}</tr>`).join('')}</tbody></table></div>
    ${aberto?'<button class="btn-primary" id="pc-receber">Confirmar recebimento informado</button>':''}
    <div class="card"><h2 style="font-size:16px">Histórico de recebimentos</h2>${historico.length?`<table><thead><tr><th>Data</th><th>Item</th><th>Quantidade</th><th>Responsável (ID)</th></tr></thead><tbody>${historico.map(h=>`<tr><td>${esc(data(h.recebido_em))}</td><td>${linhas.find(l=>l.id===h.item_id)?.item||'—'}</td><td>${h.quantidade}</td><td>${esc(h.responsavel)}</td></tr>`).join('')}</tbody></table>`:'Nenhum recebimento registrado.'}</div>`;
    botao('pc-voltar',listar);botao('pc-editar',editar);
    botao('pc-gravar-apelido',async()=>{await operar('apelido',{apelido:document.getElementById('pc-apelido').value.trim()});await detalhar(p.id);showSuccess('Apelido salvo.');});
    botao('pc-gravar-numero',async()=>{await operar('pc',{pc:document.getElementById('pc-numero').value});await detalhar(p.id);showSuccess('P.C. salvo.');});
    botao('pc-emitir',async()=>{if(!confirm('Emitir este pedido? Os itens não poderão mais ser alterados.'))return;await operar('emitir');await detalhar(p.id);imprimir();});
    botao('pc-imprimir',imprimir);
    botao('pc-cancelar',async()=>{if(!confirm('Cancelar o pedido e encerrar o saldo pendente? O histórico será preservado.'))return;await operar('cancelar');await detalhar(p.id);});
    root().querySelectorAll('[data-saldo]').forEach(b=>b.addEventListener('click',()=>{const l=linhas.find(l=>l.id===b.dataset.saldo);root().querySelector(`[data-receber="${l.id}"]`).value=l.quantidade-l.recebido;}));
    botao('pc-receber',async()=>{
      const recebimentos=[];for(const input of root().querySelectorAll('[data-receber]')){const n=Number(input.value),l=linhas.find(l=>l.id===input.dataset.receber);if(!Number.isSafeInteger(n)||n<0||n>l.quantidade-l.recebido)throw new Error('Revise a quantidade do item '+l.item);if(n>0)recebimentos.push({id:l.id,quantidade:n});}
      if(!recebimentos.length)throw new Error('Informe pelo menos uma quantidade a receber.');
      if(!confirm('Confirmar estas quantidades recebidas? Este registro não altera o estoque.'))return;
      await operar('receber',{itens:recebimentos});await detalhar(p.id);showSuccess('Recebimento registrado; estoque não alterado.');
    });
  }
  function imprimir(){
    const aba=window.open('','_blank');if(!aba){showError('Pedido salvo. Permita novas abas e clique em Abrir documento / PDF.');return;}
    aba.opener=null;
    aba.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido ${esc(numero(atual))}</title><style>body{font-family:Arial,sans-serif;margin:25px;color:#172033}h1{font-size:22px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:9px;text-align:left;font-size:12px;overflow-wrap:anywhere}td{white-space:pre-wrap}th{background:#eef2fb}button{padding:10px;margin-bottom:18px}thead{display:table-header-group}@page{size:A4 landscape;margin:12mm}@media print{button{display:none}body{margin:0}tr{break-inside:avoid}}</style></head><body><button id="print">Imprimir / Salvar como PDF</button><h1>Pedido ${esc(numero(atual))}</h1><p>Descrição / Apelido: ${esc(atual.apelido||'Não informado')}<br>Emissão: ${esc(data(atual.emitido_em))}<br>P.C. do sistema: ${esc(atual.pc||'Não informado')}<br>Situação: ${esc(status[atual.status])}</p><table><thead><tr><th>Nº item</th><th>Descrição</th><th>Cód. fabricante</th><th>DV</th><th>Quantidade solicitada</th></tr></thead><tbody>${linhas.map(l=>`<tr><td>${l.item}</td><td>${esc(l.descricao)}</td><td>${esc(l.cod_fabricante)}</td><td>${esc(l.dv)}</td><td>${l.quantidade}</td></tr>`).join('')}</tbody></table></body></html>`);aba.document.close();aba.document.getElementById('print').addEventListener('click',()=>aba.print());
  }
  return {abrir};
})();
