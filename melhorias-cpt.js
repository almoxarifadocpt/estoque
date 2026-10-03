/* =========================================================
   MELHORIAS — Gestão de Estoque CPT
   Carregar DEPOIS do script principal (e do melhoria.js):
   <script src="melhorias-cpt.js"></script>   (antes de </body>)
   ========================================================= */

/* ---------- Utilitários ---------- */
const ADMIN_MATRICULAS = ['87002923', '81011679'];
const NOME_ADMIN = 'Administrador';
const _POR_PAG = 10;
let _pgMov = 1, _pgInicio = 1, _adminAnterior = null, _logoCache = { src: null, out: null };

const _ehMatAdmin = m => ADMIN_MATRICULAS.includes(String(m || '').trim().toLowerCase());
const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const _rotuloMat = m => `${m.nome} (Cód: ${m.codigo || m.id})`;

function _acharMaterial(txt) {
  const t = String(txt || '').trim().toLowerCase();
  if (!t) return null;
  return db.materiais.find(m => _rotuloMat(m).toLowerCase() === t)
      || db.materiais.find(m => String(m.nome).toLowerCase() === t)
      || db.materiais.find(m => String(m.codigo || m.id).toLowerCase() === t) || null;
}
function _hojeISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _paraDia(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const p = String(s || '').split(',')[0].split('/');
  return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : null;
}
function _fmtData(s) {
  if (!s) return '-';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s).split(',')[0];
}
function _diasEntre(a, b) {
  const x = _paraDia(a), y = _paraDia(b);
  return (x && y) ? Math.round((y - x) / 86400000) : null;
}
const _txtDias = n => n === 0 ? 'mesmo dia' : (n === 1 ? '1 dia' : n + ' dias');

function _paginar(lista, pg) {
  const total = lista.length, paginas = Math.max(1, Math.ceil(total / _POR_PAG));
  pg = Math.min(Math.max(1, pg), paginas);
  const ini = (pg - 1) * _POR_PAG;
  return { itens: lista.slice(ini, ini + _POR_PAG), ini, fim: Math.min(ini + _POR_PAG, total), total, paginas, pg };
}
function _htmlRodape(k, fn) {
  return `<div class="card-footer bg-white d-flex justify-content-between align-items-center py-2">
    <small class="text-muted" id="page-info-${k}">Exibindo 0 de 0 itens</small>
    <div class="btn-group btn-group-sm">
      <button type="button" class="btn btn-outline-secondary" id="btn-${k}-prev" onclick="${fn}(-1)"><i class="fa-solid fa-chevron-left me-1"></i> Anterior</button>
      <button type="button" class="btn btn-outline-secondary" id="btn-${k}-next" onclick="${fn}(1)">Próxima <i class="fa-solid fa-chevron-right ms-1"></i></button>
    </div></div>`;
}
function _rodape(p, k) {
  document.getElementById(`page-info-${k}`).innerText = p.total === 0
    ? 'Exibindo 0 de 0 itens'
    : `Exibindo ${p.ini + 1} a ${p.fim} de ${p.total} itens (Página ${p.pg} de ${p.paginas})`;
  document.getElementById(`btn-${k}-prev`).disabled = p.pg <= 1;
  document.getElementById(`btn-${k}-next`).disabled = p.pg >= p.paginas;
}

/* ---------- Ajustes de HTML (executam ao carregar) ---------- */
(function () {
  const css = document.createElement('style');
  css.textContent = `
    #sidebar .badge.bg-danger.w-100 { background-color: rgba(248,113,113,.16) !important; color: #fecaca !important; border: 1px solid rgba(248,113,113,.38); padding: .5em .7em; font-size: .72rem; }
    .sidebar-logo { max-height: 46px; max-width: 100%; object-fit: contain; display: block; }
    #sidebar .sidebar-header > div.has-logo { flex-direction: column; align-items: flex-start !important; }`;
  document.head.appendChild(css);

  // Logo na barra lateral
  const box = document.querySelector('#sidebar .sidebar-header > div');
  if (box) {
    const img = document.createElement('img');
    img.id = 'img-logo-sidebar'; img.alt = 'Logo CPT'; img.className = 'sidebar-logo'; img.style.display = 'none';
    box.insertBefore(img, box.firstChild);
  }

  // Compras: coluna "Data de Recebimento" logo após "Data"
  const trC = document.querySelector('#sec-compras thead tr');
  if (trC && !trC.querySelector('.th-recebimento')) {
    const th = document.createElement('th');
    th.className = 'th-recebimento'; th.textContent = 'Data de Recebimento';
    trC.insertBefore(th, trC.children[1]);
  }

  // Compras: material pesquisável (em branco por padrão)
  const sel = document.getElementById('comp-material-id');
  if (sel) {
    const inp = document.createElement('input');
    inp.type = 'text'; inp.id = 'comp-material-input'; inp.className = 'form-control';
    inp.setAttribute('list', 'list-materiais-compra'); inp.placeholder = 'Digite para pesquisar o material...';
    inp.autocomplete = 'off'; inp.required = true;
    const dl = document.createElement('datalist'); dl.id = 'list-materiais-compra';
    sel.replaceWith(inp); inp.after(dl);
  }

  // Movimentação: rodapé de paginação
  const tbMov = document.getElementById('tbody-movimentacoes');
  if (tbMov) tbMov.closest('.card').insertAdjacentHTML('beforeend', _htmlRodape('mov', 'mudarPaginaMov'));
  const fMov = document.getElementById('filtro-historico-mov');
  if (fMov) fMov.setAttribute('oninput', '_pgMov=1;renderMovimentacao()');

  // Início: remove coluna Código e adiciona rodapé de paginação
  const thIni = document.querySelector('#sec-inicio thead th');
  if (thIni && thIni.textContent.trim() === 'Código') thIni.remove();
  const tbIni = document.getElementById('tbody-alertas-inicio');
  if (tbIni) tbIni.closest('.card').insertAdjacentHTML('beforeend', _htmlRodape('alertas', 'mudarPaginaInicio'));
})();

/* ---------- 2, 3 e 4: acesso de administrador ---------- */
const _carregarDadosOrig = carregarDados;
carregarDados = async function () {
  await _carregarDadosOrig();
  await garantirAdmins();
};

async function garantirAdmins() {
  for (const mat of ADMIN_MATRICULAS) {
    let u = db.usuarios.find(x => String(x.matricula).toLowerCase() === mat);
    if (!u) {
      u = { id: 'usr_admin_' + mat, matricula: mat, nome: NOME_ADMIN, setor: 'Almoxarifado', perfil: 'ADMIN' };
      db.usuarios.push(u);
      await saveToStore('usuarios', u);
    } else if (u.perfil !== 'ADMIN' || u.nome === 'Administradora Master') {
      u.perfil = 'ADMIN';
      if (u.nome === 'Administradora Master') u.nome = NOME_ADMIN;
      await saveToStore('usuarios', u);
    }
  }
}

function autenticarPorMatricula(matricula) {
  const mat = (matricula || '').trim().toLowerCase();
  const info = document.getElementById('sessao-user-info');
  const u = mat ? db.usuarios.find(x => String(x.matricula).toLowerCase() === mat) : null;
  const admin = !!mat && ((u && u.perfil === 'ADMIN') || _ehMatAdmin(mat));
  if (admin) {
    usuarioLogado = { ...(u || { id: 'usr_admin_' + mat, matricula: mat, setor: 'Almoxarifado' }), perfil: 'ADMIN' };
    if (_ehMatAdmin(mat) || !usuarioLogado.nome) usuarioLogado.nome = NOME_ADMIN;
    if (info) info.innerHTML = `<span class="badge bg-success w-100"><i class="fa-solid fa-circle-check me-1"></i>${_esc(usuarioLogado.nome)}</span>`;
  } else if (mat) {
    usuarioLogado = null;
    if (info) info.innerHTML = `<span class="badge bg-danger w-100"><i class="fa-solid fa-ban me-1"></i>Acesso não autorizado</span>`;
  } else {
    usuarioLogado = null;
    if (info) info.innerHTML = `<span class="badge bg-warning text-dark w-100"><i class="fa-solid fa-lock me-1"></i>Acesso Administrador</span>`;
  }
  atualizarInterfacePorPerfil();
}

function atualizarInterfacePorPerfil() {
  const isAdmin = !!(usuarioLogado && usuarioLogado.perfil === 'ADMIN');
  const isMaster = isAdmin && _ehMatAdmin(usuarioLogado.matricula);
  document.querySelectorAll('.menu-admin').forEach(el => el.classList.toggle('d-none', !isAdmin));
  document.querySelectorAll('.menu-solicitante').forEach(el => el.classList.remove('d-none'));
  const mc = document.getElementById('menu-colaboradores-master');
  if (mc) mc.classList.toggle('d-none', !isMaster);
  const bn = document.getElementById('btn-novo-material-acao');
  if (bn) bn.classList.toggle('d-none', !isAdmin);
  if (_adminAnterior !== isAdmin) {
    _adminAnterior = isAdmin;
    showSection(isAdmin ? 'inicio' : 'solicitacao');
  } else {
    atualizarOpcoesSolicitacao();
  }
}

/* ---------- 1: tela de abertura = Solicitar Retirada ---------- */
function _opcoesMateriais() {
  return '<option value="">Selecione o material...</option>' + db.materiais.map(m =>
    `<option value="${_esc(m.id)}">${_esc(m.nome)} (Estoque: ${m.qtd} ${m.unidade || 'UN'})</option>`).join('');
}
function atualizarOpcoesSolicitacao() {
  const html = _opcoesMateriais();
  document.querySelectorAll('.sol-item-material').forEach(s => {
    const v = s.value; s.innerHTML = html;
    if ([...s.options].some(o => o.value === v)) s.value = v;
  });
}
const _addLinhaOrig = adicionarLinhaMaterialSolicitacao;
adicionarLinhaMaterialSolicitacao = function () { _addLinhaOrig(); atualizarOpcoesSolicitacao(); };

const _showSectionOrig = showSection;
showSection = function (id) {
  if (id === 'movimentacao') _pgMov = 1;
  if (id === 'inicio') _pgInicio = 1;
  _showSectionOrig(id);
};

/* ---------- 5: Compras ---------- */
function renderCompras() {
  const tbody = document.getElementById('tbody-compras');
  tbody.innerHTML = '';
  db.compras.forEach(c => {
    const idMat = c.materialId || c.material_id;
    const mat = db.materiais.find(m => m.id === idMat || m.codigo === idMat);
    const pend = c.status === 'Pendente';
    const rec = c.data_recebimento || c.dataRecebimento;
    let recHtml = '<span class="text-muted">-</span>';
    if (rec) {
      const n = _diasEntre(c.data, rec);
      recHtml = _fmtData(rec) + (n != null ? ` <small class="text-muted">(${_txtDias(n)})</small>` : '');
    }
    const statusBadge = pend ? '<span class="badge bg-warning text-dark">Pendente</span>' : '<span class="badge bg-success">Recebido</span>';
    const btn = pend
      ? `<button class="btn btn-sm btn-success me-1" onclick="receberCompra('${c.id}')"><i class="fa-solid fa-box-open me-1"></i> Receber</button>
         <button class="btn btn-sm btn-outline-danger" onclick="excluirCompra('${c.id}')" title="Excluir Ordem"><i class="fa-solid fa-trash"></i></button>`
      : '<button class="btn btn-sm btn-secondary" disabled>Concluído</button>';
    tbody.innerHTML += `
      <tr>
        <td>${_fmtData(c.data)}</td>
        <td>${recHtml}</td>
        <td>${mat ? _esc(mat.nome) : 'N/A'}</td>
        <td>${c.qtd} ${mat ? (mat.unidade || 'UN') : ''}</td>
        <td>${statusBadge}</td>
        <td>${btn}</td>
      </tr>`;
  });
}

async function receberCompra(compraId) {
  const compra = db.compras.find(c => c.id === compraId);
  if (!compra) return;
  if (!confirm('Confirmar o recebimento desta ordem de compra? O estoque do material será atualizado automaticamente.')) return;
  compra.status = 'Concluído';
  compra.data_recebimento = _hojeISO();
  await saveToStore('compras', compra);
  const idMat = compra.materialId || compra.material_id;
  const mat = db.materiais.find(m => m.id === idMat || m.codigo === idMat);
  if (mat) {
    mat.qtd = Number(mat.qtd) + Number(compra.qtd);
    await saveToStore('materiais', mat);
  }
  const mov = {
    id: Date.now().toString(),
    data: new Date().toLocaleString('pt-BR'),
    tipo: 'ENTRADA',
    material_id: mat ? mat.id : idMat,
    qtd: compra.qtd,
    obs: `Recebimento Ordem Compra #${compra.id}`
  };
  db.movimentacoes.unshift(mov);
  await saveToStore('movimentacoes', mov);
  renderCompras();
  renderInicio();
}

function openCompraModal() {
  document.getElementById('form-compra').reset();
  document.getElementById('comp-material-input').value = '';
  document.getElementById('list-materiais-compra').innerHTML =
    db.materiais.map(m => `<option value="${_esc(_rotuloMat(m))}"></option>`).join('');
  new bootstrap.Modal(document.getElementById('modalCompra')).show();
}

async function salvarCompra(e) {
  e.preventDefault();
  const mat = _acharMaterial(document.getElementById('comp-material-input').value);
  if (!mat) { alert('Selecione um material da lista de sugestões.'); return; }
  const nova = {
    id: Date.now().toString(),
    data: _hojeISO(),
    material_id: mat.id,
    qtd: Number(document.getElementById('comp-quantidade').value),
    status: 'Pendente'
  };
  db.compras.push(nova);
  await saveToStore('compras', nova);
  bootstrap.Modal.getInstance(document.getElementById('modalCompra')).hide();
  renderCompras();
  renderInicio();
}

/* ---------- 6: Dashboard com busca e padrão em branco ---------- */
function carregarSelectDashboard() {
  const sel = document.getElementById('dash-select-material');
  const dl = document.getElementById('list-materiais-dashboard');
  const inp = document.getElementById('dash-input-search');
  const anterior = sel.value;
  sel.innerHTML = '<option value="">Selecione...</option>' +
    db.materiais.map(m => `<option value="${_esc(m.id)}">${_esc(_rotuloMat(m))}</option>`).join('');
  dl.innerHTML = db.materiais.map(m => `<option value="${_esc(_rotuloMat(m))}"></option>`).join('');
  const atual = anterior && db.materiais.find(m => m.id === anterior);
  if (atual) { sel.value = anterior; inp.value = _rotuloMat(atual); }
  else { sel.value = ''; inp.value = ''; }
}

function selecionarMaterialViaSearch(valor) {
  const mat = _acharMaterial(valor);
  document.getElementById('dash-select-material').value = mat ? mat.id : '';
  renderDashboardCharts();
}

const _renderDashOrig = renderDashboardCharts;
renderDashboardCharts = function () {
  const vazio = !document.getElementById('dash-select-material').value;
  const cv = document.getElementById('chartEvolucaoEstoque');
  let h = document.getElementById('dash-evolucao-vazio');
  if (!h) {
    h = document.createElement('div');
    h.id = 'dash-evolucao-vazio'; h.className = 'text-center text-muted py-5';
    h.innerHTML = '<i class="fa-solid fa-magnifying-glass me-2"></i>Pesquise e selecione um material para ver a evolução do saldo.';
    cv.parentNode.insertBefore(h, cv);
  }
  h.style.display = vazio ? 'block' : 'none';
  cv.style.display = vazio ? 'none' : 'block';
  _renderDashOrig();
};

/* ---------- 7: locais em ordem alfabética ---------- */
function carregarFiltroLocais() {
  const s = document.getElementById('filtro-local-material');
  const atual = s.value;
  const locais = [...new Set(db.materiais.map(m => m.local).filter(l => l && l.trim() !== ''))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  s.innerHTML = '<option value="">Todos os Locais de Armazenamento</option>' +
    locais.map(l => `<option value="${_esc(l)}">${_esc(l)}</option>`).join('');
  if (locais.includes(atual)) s.value = atual;
}

/* ---------- 8: logo na barra lateral (fundo transparente) ---------- */
function _removerFundo(src) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      try {
        const k = Math.min(1, 400 / Math.max(im.width, im.height));
        const w = Math.max(1, Math.round(im.width * k)), h = Math.max(1, Math.round(im.height * k));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, w, h);
        const id = cx.getImageData(0, 0, w, h), d = id.data;
        const cantos = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => {
          const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]];
        });
        const opacos = cantos.filter(c => c[3] >= 10);
        if (opacos.length === 0) return res(src);               // já é transparente
        const bg = [0, 1, 2].map(j => Math.round(opacos.reduce((a, c) => a + c[j], 0) / opacos.length));
        const dist = i => Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2]));
        const T = 60;
        if (opacos.some(c => Math.max(Math.abs(c[0] - bg[0]), Math.abs(c[1] - bg[1]), Math.abs(c[2] - bg[2])) > T)) return res(src); // fundo não uniforme
        const perto = p => d[p * 4 + 3] < 10 || dist(p * 4) <= T;
        const vis = new Uint8Array(w * h), st = [];
        const push = (x, y) => { const p = y * w + x; if (!vis[p] && perto(p)) { vis[p] = 1; st.push(p); } };
        for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
        for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
        while (st.length) {
          const p = st.pop(), x = p % w, y = (p - x) / w;
          if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y);
          if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
        }
        // suaviza a borda para não sobrar halo claro
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const p = y * w + x;
          if (vis[p]) continue;
          if ((x > 0 && vis[p - 1]) || (x < w - 1 && vis[p + 1]) || (y > 0 && vis[p - w]) || (y < h - 1 && vis[p + w])) {
            const dd = dist(p * 4);
            if (dd < T * 2.5) d[p * 4 + 3] = Math.round(255 * Math.max(0, (dd - T) / (T * 1.5)));
          }
        }
        for (let p = 0; p < vis.length; p++) if (vis[p]) d[p * 4 + 3] = 0;
        cx.putImageData(id, 0, 0);
        res(cv.toDataURL('image/png'));
      } catch (e) { res(src); }
    };
    im.onerror = () => res(src);
    im.src = src;
  });
}

async function atualizarLogoSidebar() {
  const img = document.getElementById('img-logo-sidebar');
  const mark = document.querySelector('#sidebar .brand-mark');
  if (!img) return;
  const box = img.parentElement;
  const src = db.config && db.config.logo;
  if (!src) {
    img.style.display = 'none'; if (mark) mark.style.display = ''; box.classList.remove('has-logo');
    return;
  }
  if (_logoCache.src !== src) _logoCache = { src, out: await _removerFundo(src) };
  img.src = _logoCache.out;
  img.style.display = 'block';
  if (mark) mark.style.display = 'none';
  box.classList.add('has-logo');
}
const _renderLogoOrig = renderLogoSistema;
renderLogoSistema = function () { _renderLogoOrig(); atualizarLogoSidebar(); };

/* ---------- 9: Movimentação paginada ---------- */
function parseDataPtBr(s) {
  if (!s) return 0;
  if (String(s).includes('-')) return new Date(s).getTime() || 0;
  const partes = String(s).split(',');
  const p = partes[0].trim().split('/');
  if (p.length === 3) {
    const hora = partes[1] ? partes[1].trim() : '00:00:00';
    return new Date(`${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}T${hora}`).getTime() || 0;
  }
  return 0;
}
function mudarPaginaMov(d) { _pgMov += d; renderMovimentacao(); }

function renderMovimentacao() {
  document.getElementById('list-materiais-movimentacao').innerHTML =
    db.materiais.map(m => `<option value="${_esc(m.nome)}">Disponível: ${m.qtd} ${m.unidade || 'UN'}</option>`).join('');
  const termo = (document.getElementById('filtro-historico-mov')?.value || '').toLowerCase().trim();
  const achar = m => {
    const id = m.materialId || m.material_id;
    return db.materiais.find(i => i.id === id || i.codigo === id || String(i.nome).toLowerCase() === String(id || '').toLowerCase());
  };
  const lista = [...db.movimentacoes]
    .sort((a, b) => (parseDataPtBr(b.data) || Number(b.id) || 0) - (parseDataPtBr(a.data) || Number(a.id) || 0))
    .filter(m => {
      const mat = achar(m);
      return (mat ? mat.nome.toLowerCase() : 'material excluído').includes(termo) || String(m.obs || '').toLowerCase().includes(termo);
    });
  const p = _paginar(lista, _pgMov);
  _pgMov = p.pg;
  const tbody = document.getElementById('tbody-movimentacoes');
  if (p.total === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Nenhuma movimentação encontrada.</td></tr>';
  } else {
    tbody.innerHTML = p.itens.map(m => {
      const mat = achar(m);
      const badge = m.tipo === 'ENTRADA'
        ? '<span class="badge bg-success"><i class="fa-solid fa-arrow-down me-1"></i>Entrada</span>'
        : '<span class="badge bg-danger"><i class="fa-solid fa-arrow-up me-1"></i>Saída</span>';
      return `<tr>
        <td><small>${m.data}</small></td>
        <td>${badge}</td>
        <td>${mat ? _esc(mat.nome) : 'Material Excluído'}</td>
        <td><strong>${m.qtd} ${mat ? (mat.unidade || 'UN') : ''}</strong></td>
        <td><small class="text-muted">${_esc(m.obs || '-')}</small></td>
      </tr>`;
    }).join('');
  }
  _rodape(p, 'mov');
}
const _salvarMovOrig = salvarMovimentacaoComTipo;
salvarMovimentacaoComTipo = async function (tipo) { _pgMov = 1; return _salvarMovOrig(tipo); };

/* ---------- 10: Início — sem coluna Código, com data do pedido e paginação ---------- */
function mudarPaginaInicio(d) { _pgInicio += d; renderInicio(); }

function renderInicio() {
  const criticos = db.materiais.filter(m => Number(m.qtd) < Number(m.min));
  const pendentes = db.solicitacoes.filter(s => s.status === 'Pendente').length;
  document.getElementById('kpi-total-materiais').innerText = db.materiais.length;
  document.getElementById('kpi-estoque-critico').innerText = criticos.length;
  document.getElementById('kpi-solicitacoes-pendentes').innerText = pendentes;
  const badgeCount = document.getElementById('badge-count-aprovacoes');
  if (pendentes > 0) { badgeCount.innerText = pendentes; badgeCount.classList.remove('d-none'); }
  else badgeCount.classList.add('d-none');

  const p = _paginar(criticos, _pgInicio);
  _pgInicio = p.pg;
  const tbody = document.getElementById('tbody-alertas-inicio');
  if (p.total === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-success py-2"><i class="fa-solid fa-circle-check me-1"></i> Todos os estoques estão com nível normal!</td></tr>';
  } else {
    tbody.innerHTML = p.itens.map(m => {
      const pend = db.compras.filter(c => (c.materialId === m.id || c.codigo === m.codigo || c.material_id === m.id) && c.status === 'Pendente');
      let compra = '<span class="badge bg-secondary">Não</span>';
      if (pend.length) {
        const total = pend.reduce((a, c) => a + Number(c.qtd), 0);
        const datas = [...new Set(pend.map(c => _fmtData(c.data)))].join(', ');
        compra = `<span class="badge bg-warning text-dark"><i class="fa-solid fa-clock me-1"></i>Em Andamento (${total} ${m.unidade || 'UN'})</span>
                  <br><small class="text-muted"><i class="fa-regular fa-calendar me-1"></i>Pedido em ${datas}</small>`;
      }
      return `<tr>
        <td><strong>${_esc(m.nome)}</strong></td>
        <td class="text-danger fw-bold">${m.qtd}</td>
        <td>${m.min}</td>
        <td><span class="badge bg-secondary">${m.unidade || 'UN'}</span></td>
        <td><span class="badge badge-low-stock">Abaixo do Mínimo</span></td>
        <td>${compra}</td>
      </tr>`;
    }).join('');
  }
  _rodape(p, 'alertas');
}

/* ---------- Partida: abre direto em Solicitar Retirada ---------- */
autenticarPorMatricula('');
