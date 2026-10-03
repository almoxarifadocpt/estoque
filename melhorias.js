/* Gestão de Estoque CPT — melhorias v1.6 (carregar logo antes de </body>) */
(function(){
'use strict';
const E=id=>document.getElementById(id),Q=s=>document.querySelector(s),QA=s=>[...document.querySelectorAll(s)],N=Number;
const ptc=(a,b)=>String(a??'').localeCompare(String(b??''),'pt-BR',{sensitivity:'base',numeric:true});
const ord=(a,k='nome')=>[...a].sort((x,y)=>ptc(x[k],y[k]));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hoje=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const fd=s=>{const m=/^(\d{4})-(\d\d)-(\d\d)/.exec(s||'');return m?`${m[3]}/${m[2]}/${m[1]}`:(s||'—')};
const dias=(a,b)=>Math.max(0,Math.round((new Date(b)-new Date(a))/864e5));
const pd=s=>{if(!s)return 0;if(/^\d{4}-/.test(s))return new Date(s).getTime()||0;const[d,h='00:00:00']=String(s).split(','),[a,b,c]=d.trim().split('/');return c?new Date(`${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}T${h.trim()}`).getTime()||0:0};
window.parseDataPtBr=pd;
const mid=x=>x.materialId||x.material_id,tipoDe=m=>m.tipoClassificacao||m.tipo_classificacao||'DIVERSOS';
const findMat=v=>db.materiais.find(m=>m.id===v||m.codigo===v);
const ADMINS=['87002923','81011679'],NOME_MASTER='Bárbara Azevedo';
const isAdm=u=>!!u&&(u.perfil==='ADMIN'||ADMINS.includes(String(u.matricula).toLowerCase()));


/* ---------- Avisos e gravação segura no Supabase ---------- */
const vistos=new Set();
function aviso(t,erro){if(vistos.has(t))return;vistos.add(t);setTimeout(()=>vistos.delete(t),8000);let c=E('toasts');if(!c){c=document.createElement('div');c.id='toasts';document.body.appendChild(c)}const d=document.createElement('div');d.className='toast-m'+(erro?' err':'');d.textContent=t;c.appendChild(d);setTimeout(()=>d.remove(),8000)}
const ALIAS={tipoClassificacao:'tipo_classificacao',materialId:'material_id',solicitanteId:'solicitante_id',solicitanteNome:'solicitante_nome',solicitanteMatricula:'solicitante_matricula'},DROP={};
window.saveToStore=async function(t,item){
  const p={...item},dr=DROP[t]=DROP[t]||{};
  for(const k in dr)if(k in p){if(dr[k]&&!(dr[k] in p))p[dr[k]]=p[k];delete p[k]}
  if(t==='materiais'&&!window.__fotos&&!p.foto)delete p.foto;
  for(let i=0;i<8;i++){
    const{error}=await supabaseClient.from(t).upsert([p]);
    if(!error)return true;
    const m=/'([^']+)' column/.exec(error.message||'');
    if(m&&m[1] in p){const k=m[1],a=ALIAS[k];dr[k]=a||null;if(a&&!(a in p))p[a]=p[k];delete p[k];if(!a)aviso(`A coluna "${k}" não existe na tabela "${t}": esse campo não foi salvo. Crie a coluna no Supabase.`,1);continue}
    aviso(`Não foi possível salvar em "${t}": ${error.message}`,1);return false;
  }
  return false;
};
window.deleteFromStore=async function(t,id){const{error}=await supabaseClient.from(t).delete().eq('id',id);if(error)aviso(`Erro ao excluir em "${t}": ${error.message}`,1)};


/* ---------- Carregamento rápido (em paralelo, fotos depois) ---------- */
window.carregarDados=async function(){
  const all=async(t,c='*',n=1000)=>{let o=[],f=0;for(;;){const{data,error}=await supabaseClient.from(t).select(c).order('id').range(f,f+n-1);if(error)return{error,data:o};o=o.concat(data||[]);if(!data||data.length<n)return{data:o};f+=n}};
  try{
    const mp=all('materiais','id,codigo,nome,tipo_classificacao,ca,validade,local,unidade,qtd,min').then(r=>r.error?all('materiais'):r);
    const R=await Promise.all([all('config'),mp,all('compras'),all('movimentacoes'),all('usuarios'),all('solicitacoes')]);
    R.forEach(r=>r.error&&aviso('Erro ao carregar dados: '+r.error.message,1));
    const c=R[0].data.find(x=>x.id==='main');
    db.config=c?{logo:c.logo||'',sidebarIcon:c.sidebar_icon||''}:{logo:'',sidebarIcon:''};
    db.materiais=R[1].data;db.compras=R[2].data;db.movimentacoes=R[3].data;db.usuarios=R[4].data;
    db.solicitacoes=R[5].data.sort((a,b)=>pd(b.data)-pd(a.data));
    window.__fotos=!db.materiais.length||'foto' in db.materiais[0];
    window.__fotosP=window.__fotos?Promise.resolve():all('materiais','id,foto',150).then(r=>{(r.data||[]).forEach(f=>{const m=db.materiais.find(x=>x.id===f.id);if(m)m.foto=f.foto});window.__fotos=!r.error;const s=E('sec-materiais');if(s&&!s.classList.contains('d-none'))renderTabelaMateriais()});
    for(const mat of ADMINS){
      let u=db.usuarios.find(x=>String(x.matricula).toLowerCase()===mat);const principal=mat===ADMINS[0];
      if(!u){u={id:'usr_'+mat,matricula:mat,nome:principal?NOME_MASTER:'Administrador',setor:'Almoxarifado',perfil:'ADMIN'};db.usuarios.push(u);saveToStore('usuarios',u)}
      else if(u.perfil!=='ADMIN'||(principal&&u.nome!==NOME_MASTER)){u.perfil='ADMIN';if(principal)u.nome=NOME_MASTER;saveToStore('usuarios',u)}
    }
  }catch(e){console.error(e);aviso('Falha ao carregar dados: '+e.message,1)}
  window.__ok=true;
};


/* ---------- Acesso por matrícula ---------- */
window.autenticarPorMatricula=function(m){
  if(!window.__ok)return;
  m=(m||E('input-matricula-sessao').value||'').trim().toLowerCase();
  const i=E('sessao-user-info'),u=db.usuarios.find(x=>String(x.matricula).toLowerCase()===m);
  if(u&&isAdm(u)){usuarioLogado=u;i.innerHTML=`<span class="badge bg-success w-100"><i class="fa-solid fa-circle-check me-1"></i><strong>${esc(u.nome)}</strong><br>${m===ADMINS[0]?'Acesso administradora':'Acesso administrador(a)'}</span>`}
  else if(m){usuarioLogado=u||{matricula:m,nome:'Visitante',perfil:'SOLICITANTE'};i.innerHTML='<span class="badge bg-secondary w-100"><i class="fa-solid fa-lock me-1"></i>Sem acesso administrativo</span>'}
  else{usuarioLogado=null;i.innerHTML=''}
  atualizarInterfacePorPerfil();
};
window.atualizarInterfacePorPerfil=function(){
  const a=isAdm(usuarioLogado),mm=a&&ADMINS.includes(String(usuarioLogado.matricula).toLowerCase());
  QA('.menu-admin').forEach(e=>e.classList.toggle('d-none',!a));
  QA('.menu-solicitante').forEach(e=>e.classList.remove('d-none'));
  E('menu-colaboradores-master')?.classList.toggle('d-none',!mm);
  E('btn-novo-material-acao')?.classList.toggle('d-none',!a);
  showSection(a?'inicio':'solicitacao');
};
window.excluirUsuario=async function(id){const u=db.usuarios.find(x=>x.id===id);if(u&&ADMINS.includes(String(u.matricula).toLowerCase()))return alert('Não é possível excluir uma matrícula administradora principal.');if(confirm('Deseja remover este colaborador?')){db.usuarios=db.usuarios.filter(x=>x.id!==id);await deleteFromStore('usuarios',id);renderUsuarios()}};


/* Correção de textos quebrados em funções existentes (só atua se o problema existir) */
const fix=(n,pr)=>{try{let s=window[n].toString();pr.forEach(([a,b])=>{s=s.split(a).join(b)});window[n]=(0,eval)('('+s+')')}catch(e){}};
fix('salvarSolicitacao',[['"mat.nome"({qtd})','"${mat.nome}" (${qtd})']]);
fix('processarAprovacao',[['nomeSol({matSol})','${nomeSol} (${matSol})']]);


/* ---------- Solicitação (materiais em ordem alfabética) ---------- */
window.adicionarLinhaMaterialSolicitacao=function(){
  const c=E('container-itens-solicitacao'),id=Date.now()+Math.random().toString(36).slice(2,5),n=c.children.length;
  const op=window.__ok?'<option value="">Selecione o material...</option>'+ord(db.materiais).map(m=>`<option value="${esc(m.id)}">${esc(m.nome)} (Estoque: ${m.qtd} ${esc(m.unidade||'UN')})</option>`).join(''):'<option value="">Carregando materiais…</option>';
  c.insertAdjacentHTML('beforeend',`<div class="item-solicitacao-row" id="linha-sol-${id}"><div class="row g-2 align-items-end"><div class="col-md-7"><label class="form-label form-label-sm fw-semibold mb-1">Item #${n+1}</label><select class="form-select form-select-sm sol-item-material" required>${op}</select></div><div class="col-md-3 col-8"><label class="form-label form-label-sm fw-semibold mb-1">Quantidade</label><input type="number" min="1" class="form-control form-control-sm sol-item-qtd" placeholder="1" required></div><div class="col-md-2 col-4 text-end">${n>0?`<button type="button" class="btn btn-outline-danger btn-sm" onclick="removerLinhaMaterialSolicitacao('${id}')" title="Remover item"><i class="fa-solid fa-trash"></i></button>`:''}</div></div></div>`);
};


/* ---------- Início: alerta de reposição com situação da compra ---------- */
window.renderInicio=function(){
  const crit=db.materiais.filter(m=>N(m.qtd)<N(m.min)),pend=db.solicitacoes.filter(s=>s.status==='Pendente').length,ab=db.compras.filter(c=>c.status==='Pendente');
  E('kpi-total-materiais').textContent=db.materiais.length;E('kpi-estoque-critico').textContent=crit.length;E('kpi-solicitacoes-pendentes').textContent=pend;
  const b=E('badge-count-aprovacoes');b.textContent=pend;b.classList.toggle('d-none',!pend);
  const L=crit.map(m=>{const ps=ab.filter(c=>[m.id,m.codigo].includes(mid(c))),q=ps.reduce((a,c)=>a+N(c.qtd),0),falta=Math.max(1,N(m.min)-N(m.qtd));return{m,ps,q,falta,rest:Math.max(0,falta-q),ini:ps.map(c=>c.data_solicitacao||c.data).sort()[0]}});
  const sem=L.filter(x=>!x.ps.length).length,f=E('alerta-filtro').value;
  E('alerta-resumo').innerHTML=`<span class="pill p-red"><i class="fa-solid fa-circle-xmark"></i>Falta comprar: ${sem}</span><span class="pill p-amb"><i class="fa-solid fa-truck-fast"></i>Compra já solicitada: ${L.length-sem}</span><span class="pill p-grn"><i class="fa-solid fa-boxes-stacked"></i>Total em alerta: ${L.length}</span>`;
  const V=L.filter(x=>f==='todos'||(f==='falta'?!x.ps.length:x.ps.length)).sort((a,b)=>(a.ps.length-b.ps.length)||ptc(a.m.nome,b.m.nome));
  E('tbody-alertas-inicio').innerHTML=V.length?V.map(x=>{const m=x.m,u=esc(m.unidade||'UN');
    const sit=x.ps.length?`<span class="badge bg-warning text-dark"><i class="fa-solid fa-truck-fast me-1"></i>COMPRA SOLICITADA</span><div class="small mt-1">${x.q} ${u} pedidos em ${fd(x.ini)} · aguardando há ${dias(x.ini,hoje())} dia(s)</div>${x.rest>0?`<div class="small text-danger fw-semibold">Ainda insuficiente: faltam ${x.rest} ${u} para o mínimo</div>`:'<div class="small text-success fw-semibold">Pedido cobre o estoque mínimo</div>'}`:`<span class="badge bg-danger"><i class="fa-solid fa-circle-xmark me-1"></i>NÃO COMPRADO</span><div class="small text-muted mt-1">Falta comprar pelo menos ${x.falta} ${u}</div>`;
    return `<tr><td><strong>#${esc(m.codigo||m.id)}</strong></td><td><strong>${esc(m.nome)}</strong></td><td class="text-danger fw-bold">${m.qtd}</td><td>${m.min}</td><td>${x.falta} ${u}</td><td>${sit}</td><td class="text-end">${x.ps.length?`<button class="btn btn-sm btn-outline-secondary" onclick="showSection('compras')">Ver pedido</button>`:`<button class="btn btn-sm btn-primary" onclick="openCompraModal('${esc(m.id)}',null,${x.falta})">Solicitar compra</button>`}</td></tr>`}).join(''):`<tr><td colspan="7" class="text-center text-success py-4"><i class="fa-solid fa-circle-check me-1"></i>${L.length?'Nenhum item neste filtro.':'Todos os estoques estão com nível normal!'}</td></tr>`;
};


/* ---------- Estoque de materiais ---------- */
window.carregarFiltroLocais=function(){const s=E('filtro-local-material'),v=s.value,L=[...new Set(db.materiais.map(m=>(m.local||'').trim()).filter(Boolean))].sort(ptc);s.innerHTML='<option value="">Todos os Locais de Armazenamento</option>'+L.map(l=>`<option value="${esc(l)}">${esc(l)}</option>`).join('');s.value=L.includes(v)?v:''};
window.filtrarMateriais=function(){
  const t=E('filtro-nome-material').value.toLowerCase().trim(),l=E('filtro-local-material').value,c=ordenacaoAtual.coluna,a=ordenacaoAtual.asc?1:-1;
  const v=m=>c==='tipoClassificacao'?tipoDe(m):c==='codigo'?(m.codigo||m.id):m[c];
  materiaisFiltradosAtuais=db.materiais.filter(m=>(String(m.nome).toLowerCase().includes(t)||String(m.codigo||m.id).toLowerCase().includes(t))&&(!l||(m.local||'').trim()===l)).sort((x,y)=>a*ptc(v(x),v(y)));
  paginaAtualMateriais=1;renderTabelaMateriais();
};
window.renderTabelaMateriais=function(){
  const tb=E('tbody-materiais'),adm=isAdm(usuarioLogado),L=materiaisFiltradosAtuais,n=L.length;
  QA('.col-acoes-admin').forEach(c=>c.classList.toggle('d-none',!adm));
  if(!n){tb.innerHTML='<tr><td colspan="11" class="text-center text-muted py-4">Nenhum material encontrado com os filtros aplicados.</td></tr>';E('page-info-materiais').textContent='Exibindo 0 de 0 itens';E('btn-page-prev').disabled=E('btn-page-next').disabled=true;return}
  const tp=Math.ceil(n/itensPorPaginaMateriais);paginaAtualMateriais=Math.min(Math.max(1,paginaAtualMateriais),tp);
  const i=(paginaAtualMateriais-1)*itensPorPaginaMateriais,f=Math.min(i+itensPorPaginaMateriais,n);
  tb.innerHTML=L.slice(i,f).map(m=>{const t=tipoDe(m),epi=t==='EPI',cr=N(m.qtd)<N(m.min);
    const val=epi&&m.validade&&m.validade!=='N/A'?fd(m.validade):'<span class="text-muted">N/A</span>';
    return `<tr><td>${m.foto?`<img src="${esc(m.foto)}" alt="${esc(m.nome)}" class="img-thumbnail-preview" onclick="zoomFoto(this.src,this.alt)" title="Clique para ampliar">`:'<i class="fa-solid fa-image text-secondary opacity-50 fs-4"></i>'}</td><td><strong>#${esc(m.codigo||m.id)}</strong></td><td><strong>${esc(m.nome)}</strong></td><td>${epi?'<span class="badge badge-epi">EPI</span>':t==='ALIMENTACAO'?'<span class="badge bg-warning text-dark">Alimentação</span>':`<span class="badge bg-light text-dark border">${esc(t)}</span>`}</td><td>${esc(m.local||'-')}</td><td>${cr?`<span class="badge badge-low-stock"><i class="fa-solid fa-triangle-exclamation me-1"></i>Crítico (${m.qtd})</span>`:`<span class="badge badge-ok-stock">${m.qtd}</span>`}</td><td>${m.min}</td><td><span class="badge bg-secondary">${esc(m.unidade||'UN')}</span></td><td>${epi?`<strong>${esc(m.ca||'N/A')}</strong>`:'<span class="text-muted">N/A</span>'}</td><td>${val}</td>${adm?`<td><button class="btn btn-sm btn-outline-primary me-1" onclick="editarMaterial('${esc(m.id)}')"><i class="fa-solid fa-pen"></i></button><button class="btn btn-sm btn-outline-danger" onclick="excluirMaterial('${esc(m.id)}')"><i class="fa-solid fa-trash"></i></button></td>`:''}</tr>`}).join('');
  E('page-info-materiais').textContent=`Exibindo ${i+1} a ${f} de ${n} itens (Página ${paginaAtualMateriais} de ${tp})`;
  E('btn-page-prev').disabled=paginaAtualMateriais===1;E('btn-page-next').disabled=paginaAtualMateriais===tp;
};


/* ---------- Compras: data da solicitação e data de chegada ---------- */
window.openCompraModal=function(pre,edit,sug){
  const s=E('comp-material-id'),c=edit?db.compras.find(x=>x.id===edit):null;
  s.innerHTML=ord(db.materiais).map(m=>`<option value="${esc(m.id)}">${esc(m.nome)} (${esc(m.unidade||'UN')})</option>`).join('');
  E('comp-id').value=c?c.id:'';s.value=c?mid(c):(pre||s.options[0]?.value||'');
  E('comp-quantidade').value=c?c.qtd:(sug||'');E('comp-data-sol').value=c?(c.data_solicitacao||c.data):hoje();
  Q('#modalCompra .modal-title').textContent=c?'Editar ordem de compra':'Nova Ordem de Compra';
  new bootstrap.Modal(E('modalCompra')).show();
};
window.salvarCompra=async function(e){
  e.preventDefault();const id=E('comp-id').value,old=id?db.compras.find(c=>c.id===id):null,d=E('comp-data-sol').value;
  const o={...(old||{}),id:id||Date.now().toString(),material_id:E('comp-material-id').value,qtd:N(E('comp-quantidade').value),data:d,data_solicitacao:d,status:old?old.status:'Pendente'};
  if(old)Object.assign(old,o);else db.compras.push(o);
  await saveToStore('compras',o);bootstrap.Modal.getInstance(E('modalCompra')).hide();renderCompras();renderInicio();
};
window.renderCompras=function(){
  const L=[...db.compras].sort((a,b)=>(a.status==='Pendente'?0:1)-(b.status==='Pendente'?0:1)||String(b.data_solicitacao||b.data).localeCompare(String(a.data_solicitacao||a.data)));
  E('tbody-compras').innerHTML=L.length?L.map(c=>{const m=findMat(mid(c)),ds=c.data_solicitacao||c.data,p=c.status==='Pendente';
    const st=p?`<span class="badge bg-warning text-dark"><i class="fa-solid fa-clock me-1"></i>Aguardando chegada</span><div class="small text-muted">há ${dias(ds,hoje())} dia(s)</div>`:`<span class="badge bg-success"><i class="fa-solid fa-circle-check me-1"></i>Recebido</span>${c.data_chegada?`<div class="small text-muted">entregue em ${dias(ds,c.data_chegada)} dia(s)</div>`:''}`;
    const ac=p?`<button class="btn btn-sm btn-success me-1" onclick="receberCompra('${c.id}')"><i class="fa-solid fa-box-open me-1"></i>Receber</button><button class="btn btn-sm btn-outline-primary me-1" onclick="openCompraModal(null,'${c.id}')" title="Editar"><i class="fa-solid fa-pen"></i></button><button class="btn btn-sm btn-outline-danger" onclick="excluirCompra('${c.id}')" title="Excluir"><i class="fa-solid fa-trash"></i></button>`:'<button class="btn btn-sm btn-secondary" disabled>Concluído</button>';
    return `<tr><td>${fd(ds)}</td><td>${esc(m?m.nome:'N/A')}</td><td>${c.qtd} ${esc(m?m.unidade||'UN':'')}</td><td>${c.data_chegada?fd(c.data_chegada):'—'}</td><td>${st}</td><td>${ac}</td></tr>`}).join(''):'<tr><td colspan="6" class="text-center text-muted py-4">Nenhuma ordem de compra registrada.</td></tr>';
};
window.receberCompra=function(id){
  const c=db.compras.find(x=>x.id===id);if(!c)return;const m=findMat(mid(c)),ok=E('rec-ok');
  E('rec-info').innerHTML=`<strong>${esc(m?m.nome:'Material')}</strong> — ${c.qtd} ${esc(m?m.unidade||'UN':'')}`;E('rec-data').value=hoje();ok.disabled=false;
  ok.onclick=async()=>{const d=E('rec-data').value;if(!d)return alert('Informe a data de chegada.');ok.disabled=true;
    c.status='Concluído';c.data_chegada=d;await saveToStore('compras',c);
    if(m){m.qtd=N(m.qtd)+N(c.qtd);await saveToStore('materiais',m)}
    const mv={id:Date.now().toString(),data:new Date().toLocaleString('pt-BR'),tipo:'ENTRADA',material_id:m?m.id:mid(c),qtd:c.qtd,obs:`Recebimento de compra (chegada em ${fd(d)})`};
    db.movimentacoes.unshift(mv);await saveToStore('movimentacoes',mv);bootstrap.Modal.getInstance(E('modalReceber')).hide();renderCompras();renderInicio()};
  new bootstrap.Modal(E('modalReceber')).show();
};


/* ---------- Movimentação com paginação ---------- */
let mp=1,ms=10;
window.renderMovimentacao=function(){
  E('list-materiais-movimentacao').innerHTML=ord(db.materiais).map(m=>`<option value="${esc(m.nome)}">Disponível: ${m.qtd} ${esc(m.unidade||'UN')}</option>`).join('');
  const t=(E('filtro-historico-mov').value||'').toLowerCase().trim();
  const L=db.movimentacoes.map(m=>({m,t:pd(m.data)||+m.id||0,x:findMat(mid(m))||db.materiais.find(i=>String(i.nome).toLowerCase()===String(mid(m)||'').toLowerCase())})).filter(o=>((o.x?o.x.nome:'material excluído')+' '+(o.m.obs||'')+' '+o.m.tipo).toLowerCase().includes(t)).sort((a,b)=>b.t-a.t);
  const tp=Math.max(1,Math.ceil(L.length/ms));mp=Math.min(Math.max(1,mp),tp);const i=(mp-1)*ms,P=L.slice(i,i+ms);
  E('tbody-movimentacoes').innerHTML=P.length?P.map(o=>`<tr><td><small>${esc(o.m.data)}</small></td><td>${o.m.tipo==='ENTRADA'?'<span class="badge bg-success"><i class="fa-solid fa-arrow-down me-1"></i>Entrada</span>':'<span class="badge bg-danger"><i class="fa-solid fa-arrow-up me-1"></i>Saída</span>'}</td><td>${esc(o.x?o.x.nome:'Material Excluído')}</td><td><strong>${o.m.qtd} ${esc(o.x?o.x.unidade||'UN':'')}</strong></td><td><small class="text-muted">${esc(o.m.obs||'-')}</small></td></tr>`).join(''):'<tr><td colspan="5" class="text-center text-muted py-4">Nenhuma movimentação encontrada.</td></tr>';
  E('mov-info').textContent=L.length?`Exibindo ${i+1} a ${i+P.length} de ${L.length} (página ${mp} de ${tp})`:'Exibindo 0 de 0 registros';
  E('mov-prev').disabled=mp<=1;E('mov-next').disabled=mp>=tp;
};
const smov=window.salvarMovimentacaoComTipo;window.salvarMovimentacaoComTipo=async t=>{mp=1;return smov(t)};


/* ---------- Dashboard completo ---------- */
const CH={},PAL=['#007e7a','#3730a3','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#6366f1','#14b8a6'];
const mk=(id,cfg)=>{CH[id]?.destroy();const c=E(id);if(c)CH[id]=new Chart(c.getContext('2d'),cfg)};
const OPT=x=>({responsive:true,maintainAspectRatio:false,...x});
function dashHTML(){
  const kp=(i,l,c='')=>`<div class="col-xl-3 col-6"><div class="card kpi-card-compact ${c}"><small class="text-muted d-block fw-bold">${l}</small><h4 class="m-0" id="${i}">0</h4></div></div>`;
  const cc=(t,i,col)=>`<div class="${col}"><div class="card h-100"><div class="card-header fw-bold">${t}</div><div class="card-body"><div class="chart-box"><canvas id="${i}"></canvas></div></div></div></div>`;
  E('sec-dashboard').innerHTML=`<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><div><h4 class="m-0 fw-bold">Dashboard Gerencial</h4><small class="text-muted">Estoque, movimentações, compras e prazos de entrega</small></div><div class="d-flex align-items-center gap-2"><label class="small text-muted fw-bold mb-0">Período:</label><select id="dash-periodo" class="form-select form-select-sm w-auto" onchange="renderDashboardCharts()"><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="180">Últimos 6 meses</option><option value="365">Últimos 12 meses</option><option value="0">Todo o histórico</option></select></div></div>
  <div class="row g-3 mb-3">${kp('dash-kpi-total-itens','ITENS CADASTRADOS')}${kp('dash-kpi-total-unidades','UNIDADES EM ESTOQUE','success')}${kp('dash-kpi-alertas','ITENS EM ALERTA','warning')}${kp('dash-kpi-zerados','ITENS ZERADOS','warning')}${kp('dash-kpi-pend','SOLICITAÇÕES PENDENTES','info')}${kp('dash-kpi-compras','COMPRAS EM ANDAMENTO','info')}${kp('dash-kpi-saidas','SAÍDAS NO PERÍODO')}${kp('dash-kpi-lead','PRAZO MÉDIO DE ENTREGA','success')}</div>
  <div class="card"><div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2"><span class="fw-bold text-primary"><i class="fa-solid fa-chart-column me-2"></i>Evolução do saldo por material</span><div><input class="form-control form-control-sm" list="list-materiais-dashboard" id="dash-input-search" placeholder="Digite o nome ou código..." onchange="selecionarMaterialViaSearch(this.value)" style="min-width:270px"><datalist id="list-materiais-dashboard"></datalist><select id="dash-select-material" class="d-none" onchange="renderDashboardCharts()"></select></div></div><div class="card-body"><div class="chart-box"><canvas id="chartEvolucaoEstoque"></canvas></div></div></div>
  <div class="row g-3 mb-3">${cc('Entradas x Saídas por mês','chMes','col-lg-7')}${cc('Distribuição por categoria','chCat','col-lg-5')}</div>
  <div class="row g-3 mb-3">${cc('Top 10 materiais mais retirados','chTop','col-lg-6')}<div class="col-lg-6"><div class="card h-100"><div class="card-header fw-bold">Itens em nível crítico</div><div class="card-body p-0 table-responsive" id="dash-crit"></div></div></div></div>
  <div class="card"><div class="card-header fw-bold">Compras em andamento</div><div class="card-body p-0 table-responsive" id="dash-compras"></div></div>`;
}
window.carregarSelectDashboard=function(){
  const s=E('dash-select-material'),d=E('list-materiais-dashboard'),p=s.value,L=ord(db.materiais),lab=m=>`${m.nome} (Cód: ${m.codigo||m.id})`;
  s.innerHTML=L.map(m=>`<option value="${esc(m.id)}">${esc(lab(m))}</option>`).join('')||'<option value="">Nenhum material cadastrado</option>';
  d.innerHTML=L.map(m=>`<option value="${esc(lab(m))}"></option>`).join('');
  const x=L.find(m=>m.id===p)||L[0];if(x){s.value=x.id;E('dash-input-search').value=lab(x)}
};
window.renderDashboardCharts=function(){
  if(!E('dash-periodo'))return;
  const per=N(E('dash-periodo').value),since=per?Date.now()-per*864e5:0,mats=db.materiais,crit=mats.filter(m=>N(m.qtd)<N(m.min));
  const movs=db.movimentacoes.map(m=>({...m,t:pd(m.data)||+m.id||0})).sort((a,b)=>a.t-b.t),mpv=movs.filter(m=>m.t>=since),sai=mpv.filter(m=>m.tipo==='SAIDA');
  const ab=db.compras.filter(c=>c.status==='Pendente'),cn=db.compras.filter(c=>c.data_chegada&&(c.data_solicitacao||c.data));
  const set=(i,v)=>E(i).textContent=v;
  set('dash-kpi-total-itens',mats.length);set('dash-kpi-total-unidades',mats.reduce((a,m)=>a+N(m.qtd),0).toLocaleString('pt-BR'));set('dash-kpi-alertas',crit.length);set('dash-kpi-zerados',mats.filter(m=>N(m.qtd)<=0).length);
  set('dash-kpi-pend',db.solicitacoes.filter(s=>s.status==='Pendente').length);set('dash-kpi-compras',ab.length);set('dash-kpi-saidas',sai.reduce((a,m)=>a+N(m.qtd),0).toLocaleString('pt-BR'));
  set('dash-kpi-lead',cn.length?Math.round(cn.reduce((a,c)=>a+dias(c.data_solicitacao||c.data,c.data_chegada),0)/cn.length)+' dias':'—');
  const mat=mats.find(m=>m.id===E('dash-select-material').value);
  if(mat){const mm=movs.filter(m=>[mat.id,mat.codigo].includes(mid(m)));let s=N(mat.qtd);mm.forEach(m=>s+=m.tipo==='ENTRADA'?-N(m.qtd):N(m.qtd));const Lb=['Saldo inicial'],D=[s];mm.forEach(m=>{s+=m.tipo==='ENTRADA'?N(m.qtd):-N(m.qtd);Lb.push((m.data||'').slice(0,10));D.push(s)});
    mk('chartEvolucaoEstoque',{data:{labels:Lb,datasets:[{type:'bar',label:`Saldo (${mat.unidade||'UN'})`,data:D,backgroundColor:D.map(v=>v<N(mat.min)?'rgba(239,68,68,.85)':'rgba(0,126,122,.85)'),borderRadius:5,maxBarThickness:38},{type:'line',label:`Mínimo (${mat.min||0})`,data:D.map(()=>N(mat.min)),borderColor:'#ef4444',borderDash:[4,4],pointRadius:0,borderWidth:2}]},options:OPT({plugins:{legend:{position:'top',labels:{boxWidth:12}}},scales:{y:{beginAtZero:true},x:{grid:{display:false}}}})})}
  const M={};mpv.forEach(m=>{const k=new Date(m.t).toISOString().slice(0,7);(M[k]=M[k]||{e:0,s:0})[m.tipo==='ENTRADA'?'e':'s']+=N(m.qtd)});const ks=Object.keys(M).sort().slice(-12);
  mk('chMes',{type:'bar',data:{labels:ks.map(k=>k.slice(5)+'/'+k.slice(0,4)),datasets:[{label:'Entradas',data:ks.map(k=>M[k].e),backgroundColor:'#10b981',borderRadius:4},{label:'Saídas',data:ks.map(k=>M[k].s),backgroundColor:'#ef4444',borderRadius:4}]},options:OPT({plugins:{legend:{position:'top',labels:{boxWidth:10}}},scales:{x:{grid:{display:false}}}})});
  const C={};mats.forEach(m=>{const t=tipoDe(m);C[t]=(C[t]||0)+1});
  mk('chCat',{type:'doughnut',data:{labels:Object.keys(C),datasets:[{data:Object.values(C),backgroundColor:PAL,borderWidth:2}]},options:OPT({plugins:{legend:{position:'right',labels:{boxWidth:10}}}})});
  const T={};sai.forEach(m=>{const x=findMat(mid(m)),n=x?x.nome:'Excluído';T[n]=(T[n]||0)+N(m.qtd)});const top=Object.entries(T).sort((a,b)=>b[1]-a[1]).slice(0,10);
  mk('chTop',{type:'bar',data:{labels:top.map(x=>x[0]),datasets:[{data:top.map(x=>x[1]),backgroundColor:'#007e7a',borderRadius:4}]},options:OPT({indexAxis:'y',plugins:{legend:{display:false}}})});
  E('dash-crit').innerHTML=crit.length?`<table class="table table-sm align-middle m-0"><thead><tr><th>Material</th><th>Atual</th><th>Mín.</th><th style="width:26%">Cobertura</th><th>Compra</th></tr></thead><tbody>${crit.sort((a,b)=>N(a.qtd)/Math.max(1,N(a.min))-N(b.qtd)/Math.max(1,N(b.min))).slice(0,12).map(m=>{const p=Math.min(100,Math.round(N(m.qtd)/Math.max(1,N(m.min))*100));return `<tr><td>${esc(m.nome)}</td><td class="text-danger fw-bold">${m.qtd}</td><td>${m.min}</td><td><div class="mini-bar"><i style="width:${p}%;background:${p<34?'#ef4444':'#EEA722'}"></i></div></td><td>${ab.some(c=>[m.id,m.codigo].includes(mid(c)))?'<span class="badge bg-warning text-dark">Solicitada</span>':'<span class="badge bg-danger">Falta comprar</span>'}</td></tr>`}).join('')}</tbody></table>`:'<div class="p-4 text-center text-success"><i class="fa-solid fa-circle-check me-1"></i>Nenhum item abaixo do mínimo.</div>';
  E('dash-compras').innerHTML=ab.length?`<table class="table table-sm align-middle m-0"><thead><tr><th>Material</th><th>Qtd.</th><th>Solicitado em</th><th>Aguardando</th></tr></thead><tbody>${ab.map(c=>{const m=findMat(mid(c)),d=c.data_solicitacao||c.data,n=dias(d,hoje());return `<tr><td>${esc(m?m.nome:'N/A')}</td><td>${c.qtd}</td><td>${fd(d)}</td><td><span class="badge ${n>15?'bg-danger':'bg-warning text-dark'}">${n} dia(s)</span></td></tr>`}).join('')}</tbody></table>`:'<div class="p-4 text-center text-muted">Nenhuma compra em andamento.</div>';
};


/* ---------- Backup: exportar e restaurar de verdade ---------- */
window.exportarBackup=async function(){await window.__fotosP;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(db,null,2)],{type:'application/json'}));a.download=`backup_gestao_cpt_${hoje()}.json`;document.body.appendChild(a);a.click();a.remove()};
window.importarBackup=async function(){
  const f=E('file-import').files[0];if(!f)return alert('Selecione um arquivo de backup (.json) primeiro.');
  let d;try{d=JSON.parse(await f.text())}catch(e){return alert('Arquivo JSON inválido.')}
  const T=['materiais','compras','movimentacoes','usuarios','solicitacoes'];
  if(!T.some(t=>Array.isArray(d[t])&&d[t].length)&&!d.config)return alert('O arquivo não contém dados reconhecíveis.');
  if(!confirm('Restaurar este backup? Registros com o mesmo ID serão atualizados e nada será apagado.\n\n'+T.map(t=>`${t}: ${(d[t]||[]).length}`).join('\n')))return;
  const btn=Q('#sec-backup .btn-warning');btn.disabled=true;let ok=0,mal=0;
  if(d.config)await saveToStore('config',{id:'main',logo:d.config.logo||'',sidebar_icon:d.config.sidebarIcon||d.config.sidebar_icon||''});
  for(const t of T){const L=(d[t]||[]).map(x=>x.id?x:{...x,id:Date.now().toString()+Math.random().toString(36).slice(2,6)});
    for(let i=0;i<L.length;i+=8){btn.textContent=`Restaurando ${t} ${Math.min(i+8,L.length)}/${L.length}…`;(await Promise.all(L.slice(i,i+8).map(x=>saveToStore(t,x)))).forEach(r=>r?ok++:mal++)}}
  await carregarDados();btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-file-import me-1"></i> Restaurar Dados';
  alert(`Restauração concluída: ${ok} registros gravados${mal?`, ${mal} com falha (veja os avisos na tela)`:''}.`);
  showSection(isAdm(usuarioLogado)?'inicio':'solicitacao');
};


/* ---------- Visual e inicialização ---------- */
function visual(){
  const l=document.createElement('link');l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap';document.head.appendChild(l);
  const s=document.createElement('style');s.textContent=`
body{font-family:'IBM Plex Sans','Segoe UI',Tahoma,sans-serif;font-size:.92rem;color:#12302f;-webkit-font-smoothing:antialiased}
.btn{font-weight:500;border-radius:8px}.btn:focus-visible{box-shadow:0 0 0 3px rgba(0,126,122,.28)!important}.btn-primary{box-shadow:0 1px 2px rgba(0,56,54,.22)}
:root{--sidebar-width:256px}#sidebar .sidebar-header{padding:18px 20px}#sidebar .sidebar-header h5{font-size:1rem;font-weight:600}
#sidebar ul.components{padding:12px 10px}#sidebar ul li a{padding:10px 12px;font-size:.9rem;font-weight:500;border-radius:8px;border-left:0!important}
#sidebar ul li a:hover{background:rgba(255,255,255,.08)}#sidebar ul li.active>a{background:rgba(255,255,255,.13);color:#fff;box-shadow:inset 3px 0 0 var(--accent-color)}
#sessao-user-info .badge{white-space:normal;text-align:left;line-height:1.4;font-size:.74rem;padding:.55em .7em}
#content{margin-left:var(--sidebar-width);padding:28px 32px 48px}.app-section{max-width:1320px;margin-inline:auto}
.app-section h3{font-size:1.35rem;font-weight:600;letter-spacing:-.01em}
.card{border:1px solid #e0e8e7;border-radius:12px;box-shadow:0 1px 2px rgba(0,56,54,.06);margin-bottom:16px}
.card-header{padding:.8rem 1.1rem;font-size:.9rem;border-bottom:1px solid #e0e8e7;border-radius:12px 12px 0 0!important}.card-body{padding:1.25rem}.card-body.p-0{padding:0}
.card-footer{background:#fff;border-top:1px solid #e0e8e7}
.kpi-card-compact{padding:14px 18px!important;margin-bottom:0}.kpi-card-compact small{letter-spacing:.04em;font-size:.72rem!important}.kpi-card-compact h4{font-size:1.8rem;font-weight:600;letter-spacing:-.02em}
.table{font-size:.875rem;font-variant-numeric:tabular-nums;--bs-table-hover-bg:#eef6f5}.table>:not(caption)>*>*{padding:.7rem .95rem}
.table thead th{font-size:.76rem;font-weight:600;color:#3f5a58;white-space:nowrap;background:#f4f8f8!important;border-bottom:1px solid #c9d6d5}
.badge{font-weight:600;font-size:.72rem;padding:.42em .7em;border-radius:6px}
.form-control,.form-select{border-color:#c9d6d5;border-radius:8px;font-size:.9rem}.form-control:focus,.form-select:focus{border-color:#007e7a;box-shadow:0 0 0 3px rgba(0,126,122,.16)}
.form-label{font-weight:500;font-size:.85rem;color:#3f5a58}
.modal-content{border:0;border-radius:14px;box-shadow:0 24px 60px rgba(0,32,31,.28);overflow:hidden}.modal-header{padding:16px 22px}.modal-body{padding:22px}.modal-footer{background:#f8fbfb;padding:14px 22px}.modal-title{font-size:1.05rem;font-weight:600}
.chart-box{position:relative;height:260px}.mini-bar{height:6px;background:#e6eded;border-radius:4px;overflow:hidden;min-width:70px}.mini-bar i{display:block;height:100%}
.pill{display:inline-flex;gap:6px;align-items:center;padding:6px 12px;border-radius:999px;font-weight:600;font-size:.8rem}.p-red{background:#fde3e3;color:#9b1c1c}.p-amb{background:#fdeecb;color:#7a4b00}.p-grn{background:#dcf3e7;color:#0e6a42}
#splash{position:fixed;inset:0;z-index:3000;background:#fff;display:grid;place-items:center;transition:opacity .45s}#splash.out{opacity:0;pointer-events:none}
.sp-box{text-align:center}.sp-box img{max-height:84px;max-width:260px}.sp-vale{font-size:2.6rem;font-weight:600;letter-spacing:.2em;color:#007e7a}
.sp-t{margin-top:18px;font-weight:600;color:#004d4a}.sp-bar{width:140px;height:3px;background:#e0e8e7;border-radius:3px;margin:16px auto 0;overflow:hidden}.sp-bar i{display:block;height:100%;width:40%;background:#EEA722;animation:sp 1s infinite ease-in-out}
@keyframes sp{0%{margin-left:-40%}100%{margin-left:100%}}
#toasts{position:fixed;right:16px;bottom:16px;z-index:4000;display:grid;gap:8px;max-width:380px}.toast-m{background:#004d4a;color:#fff;padding:10px 14px;border-radius:8px;font-size:.85rem;box-shadow:0 6px 18px rgba(0,0,0,.2)}.toast-m.err{background:#b42318}
@media(max-width:768px){#content{margin-left:0;padding:16px 14px 32px}#sidebar{margin-left:-256px}#sidebar.active{margin-left:0}#content.active{margin-left:256px}}`;
  document.head.appendChild(s);
}
function estrutura(){
  Q('#sidebar .p-2 small').innerHTML='<i class="fa-solid fa-user-shield me-1"></i>ACESSO SOMENTE PARA ADMINISTRADORES';
  Q('#sec-inicio h3 + small')?.remove();
  const v=Q('.sidebar-footer strong');if(v)v.textContent='v1.6.0';
  Q('#sec-inicio thead tr').innerHTML='<th>Código</th><th>Material</th><th>Qtd. Atual</th><th>Qtd. Mínima</th><th>Falta p/ mínimo</th><th>Situação da compra</th><th></th>';
  const h=Q('#sec-inicio .header-alerta-estoque');h.classList.add('d-flex','justify-content-between','align-items-center');
  h.insertAdjacentHTML('beforeend','<select id="alerta-filtro" class="form-select form-select-sm w-auto" onchange="renderInicio()"><option value="todos">Todos os itens em alerta</option><option value="falta">Falta comprar</option><option value="comprado">Compra já solicitada</option></select>');
  Q('#sec-inicio .card .table-responsive').insertAdjacentHTML('beforebegin','<div id="alerta-resumo" class="d-flex flex-wrap gap-2 p-3 border-bottom"></div>');
  Q('#sec-compras thead tr').innerHTML='<th>Solicitado em</th><th>Material</th><th>Qtd.</th><th>Chegada</th><th>Status</th><th>Ações</th>';
  E('comp-quantidade').closest('.mb-3').insertAdjacentHTML('afterend','<div class="mb-3"><label class="form-label">Data da solicitação *</label><input type="date" class="form-control" id="comp-data-sol" required></div><input type="hidden" id="comp-id">');
  document.body.insertAdjacentHTML('beforeend','<div class="modal fade" id="modalReceber" tabindex="-1"><div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Registrar chegada do material</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><p id="rec-info" class="mb-3"></p><label class="form-label">Data de chegada *</label><input type="date" id="rec-data" class="form-control"><div class="form-text">O estoque será atualizado com a quantidade da ordem.</div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button><button type="button" class="btn btn-success" id="rec-ok">Confirmar recebimento</button></div></div></div></div>');
  Q('#sec-movimentacao .col-md-8 .card').insertAdjacentHTML('beforeend','<div class="card-footer d-flex flex-wrap justify-content-between align-items-center gap-2"><small class="text-muted" id="mov-info"></small><div class="d-flex align-items-center gap-2"><select id="mov-size" class="form-select form-select-sm w-auto"><option value="10">10 por página</option><option value="25">25 por página</option><option value="50">50 por página</option><option value="100">100 por página</option></select><div class="btn-group btn-group-sm"><button type="button" class="btn btn-outline-secondary" id="mov-prev">‹ Anterior</button><button type="button" class="btn btn-outline-secondary" id="mov-next">Próxima ›</button></div></div></div>');
  E('mov-size').onchange=e=>{ms=N(e.target.value);mp=1;renderMovimentacao()};E('mov-prev').onclick=()=>{mp--;renderMovimentacao()};E('mov-next').onclick=()=>{mp++;renderMovimentacao()};
  E('filtro-historico-mov').oninput=()=>{mp=1;renderMovimentacao()};
  ['mat-tipo-classificacao','mat-unidade'].forEach(i=>{const s=E(i),v=s.value,o=[...s.options].sort((a,b)=>ptc(a.text,b.text));o.forEach(x=>s.appendChild(x));s.value=v});
  dashHTML();
}
function splash(){
  document.body.insertAdjacentHTML('beforeend','<div id="splash"><div class="sp-box"><img src="logo-vale.png" alt="Vale S.A." onerror="this.outerHTML=\'<div class=sp-vale>VALE S.A.</div>\'"><div class="sp-t">Gestão de Estoque CPT</div><div class="sp-bar"><i></i></div></div></div>');
  setTimeout(()=>{const p=E('splash');p.classList.add('out');setTimeout(()=>p.remove(),600)},1100);
}
splash();visual();estrutura();
window.__ok=false;usuarioLogado=null;atualizarInterfacePorPerfil();
})();