// SensorControl: cores suaves no detalhe dos pedidos. Não grava dados.
(() => {
  'use strict';
  const iniciar = () => {
    const root = document.getElementById('page-content');
    if (!root || document.getElementById('sc-cores-pedidos')) return;
    const style = document.createElement('style');
    style.id = 'sc-cores-pedidos';
    style.textContent = `
      .sc-pedido-legenda { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 12px; font-size:12px; }
      .sc-pedido-legenda span { padding:5px 10px; border-radius:6px; border:1px solid transparent; }
      .sc-pedido-legenda .sc-leg-falta { background:#fff3f1; color:#8c3d32; border-color:#f4d4ce; }
      .sc-pedido-legenda .sc-leg-parcial { background:#fff8e8; color:#805b12; border-color:#efdfb2; }
      .sc-pedido-legenda .sc-leg-completo { background:#eef8f1; color:#316946; border-color:#cde7d5; }
      .sc-pedido-legenda .sc-leg-cancelado { background:#f1f3f5; color:#59636f; border-color:#dce1e6; }
      table.sc-pedido-cores tbody tr.sc-falta > td { background:#fff3f1; }
      table.sc-pedido-cores tbody tr.sc-parcial > td { background:#fff8e8; }
      table.sc-pedido-cores tbody tr.sc-completo > td { background:#eef8f1; }
      table.sc-pedido-cores tbody tr.sc-cancelado > td { background:#f1f3f5; color:#59636f; }
      table.sc-pedido-cores tbody tr.sc-falta > td:first-child { box-shadow:inset 3px 0 #d7897c; }
      table.sc-pedido-cores tbody tr.sc-parcial > td:first-child { box-shadow:inset 3px 0 #d4b15a; }
      table.sc-pedido-cores tbody tr.sc-completo > td:first-child { box-shadow:inset 3px 0 #80b18f; }
      table.sc-pedido-cores tbody tr.sc-cancelado > td:first-child { box-shadow:inset 3px 0 #a4adb6; }
      .sc-saldo-pedido { display:inline-block; padding:4px 8px; border-radius:6px; font-weight:600; font-variant-numeric:tabular-nums; }
      .sc-falta .sc-saldo-pedido { background:#f9dfd9; color:#82392f; }
      .sc-parcial .sc-saldo-pedido { background:#f5e9c5; color:#76520e; }
      .sc-completo .sc-saldo-pedido { background:#dcefe2; color:#2e6341; }
      .sc-cancelado .sc-saldo-pedido { background:#e3e7eb; color:#59636f; }
      .sc-situacao-item { display:block; font-size:10.5px; font-weight:500; margin-top:4px; }
    `;
    document.head.append(style);
    const normalizar = v => String(v || '').trim().toLocaleLowerCase('pt-BR');
    const analisar = (solicitado, recebido, pendente, cancelado) => {
      if (![solicitado, recebido, pendente].every(Number.isSafeInteger) || solicitado <= 0 || recebido < 0 || pendente < 0 || recebido + pendente !== solicitado) return null;
      if (pendente === 0) return ['sc-completo', 'Recebido'];
      if (cancelado) return ['sc-cancelado', 'Saldo cancelado'];
      return recebido === 0 ? ['sc-falta', 'Não recebido'] : ['sc-parcial', 'Recebido parcialmente'];
    };
    const atualizar = () => {
      const titulo = root.querySelector('h1');
      if (!titulo || !/^(SC-\d+|Rascunho)$/.test(titulo.textContent.trim())) return;
      const subtitulo = titulo.parentElement?.querySelector('.page-subtitle');
      const cancelado = /^cancelado\b/i.test(subtitulo?.textContent.trim() || '');
      root.querySelectorAll('table').forEach(table => {
        const ths = [...table.querySelectorAll('thead th')].map(th => normalizar(th.textContent));
        const a = ths.indexOf('solicitado'), b = ths.indexOf('recebido'), c = ths.indexOf('pendente');
        if (a < 0 || b < 0 || c < 0) return;
        table.classList.add('sc-pedido-cores');
        let contagem = { falta:0, parcial:0, completo:0, cancelado:0 };
        table.querySelectorAll('tbody tr').forEach(tr => {
          const tds = [...tr.children];
          if (!tds[a] || !tds[b] || !tds[c]) return;
          const saldo = tds[c].querySelector('.sc-saldo-pedido');
          const valor = saldo ? saldo.textContent.trim() : tds[c].textContent.trim();
          const valores = [tds[a].textContent.trim(), tds[b].textContent.trim(), valor];
          if (!valores.every(v => /^\d+$/.test(v))) return;
          const resultado = analisar(...valores.map(Number), cancelado);
          if (!resultado) return;
          const [classe, rotulo] = resultado;
          contagem[classe.replace('sc-','')]++;
          tr.classList.remove('sc-falta','sc-parcial','sc-completo','sc-cancelado');
          tr.classList.add(classe);
          tds[c].replaceChildren();
          const numero = document.createElement('span'); numero.className='sc-saldo-pedido'; numero.textContent=valor;
          const texto = document.createElement('span'); texto.className='sc-situacao-item'; texto.textContent=rotulo;
          tds[c].append(numero,texto);
        });
        let legenda = table.parentElement.querySelector('.sc-pedido-legenda');
        if (!legenda) { legenda=document.createElement('div');legenda.className='sc-pedido-legenda';legenda.setAttribute('aria-label','Situação dos itens do pedido');table.before(legenda); }
        legenda.replaceChildren();
        const entradas=[['sc-leg-falta','Não recebido',contagem.falta],['sc-leg-parcial','Parcial',contagem.parcial],['sc-leg-completo','Recebido',contagem.completo]];
        if(cancelado) entradas.push(['sc-leg-cancelado','Saldo cancelado',contagem.cancelado]);
        entradas.forEach(([classe,texto,n])=>{const s=document.createElement('span');s.className=classe;s.textContent=`${texto}: ${n}`;legenda.append(s);});
      });
    };
    let agendado=false;
    const observer=new MutationObserver(() => {
      if(agendado)return;
      agendado=true;
      requestAnimationFrame(()=>{agendado=false;observer.disconnect();try{atualizar();}finally{observer.observe(root,{childList:true,subtree:true,characterData:true});}});
    });
    atualizar();observer.observe(root,{childList:true,subtree:true,characterData:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar,{once:true});else iniciar();
})();
