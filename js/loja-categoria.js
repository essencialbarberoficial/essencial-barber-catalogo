// ============================================================================
// Essencial Barber - Página de Categoria (js/loja-categoria.js)
// ============================================================================
let TODOS_PRODUTOS = [];
let TODAS_CATEGORIAS = [];
let ATRIBUTOS_SELECIONADOS = {}; // { "Cor": Set(["Preto","Dourado"]) }

document.addEventListener('DOMContentLoaded', async () => {
  const ordenar = getQueryParam('ordenar');
  if (ordenar) document.getElementById('select-ordenacao').value = ordenar;

  const busca = getQueryParam('busca');
  if (busca) document.getElementById('input-busca-header').value = busca;

  try {
    [TODOS_PRODUTOS, TODAS_CATEGORIAS] = await Promise.all([
      fetch(`${API_BASE}/produtos`).then((r) => r.json()),
      fetch(`${API_BASE}/categorias`).then((r) => r.json())
    ]);
  } catch (err) {
    console.error('Erro ao carregar dados da categoria', err);
    document.getElementById('grid-categoria').innerHTML = '<div class="empty-msg">Não foi possível carregar os produtos.</div>';
    return;
  }

  montarCabecalhoCategoria();
  await montarFiltroAtributos();
  aplicarFiltros();
});

function categoriaAtualId() {
  return getQueryParam('id');
}

function descendentesDe(categoriaId) {
  const filhos = TODAS_CATEGORIAS.filter((c) => String(c.paiId) === String(categoriaId));
  return filhos.reduce((acc, f) => acc.concat(f.id, descendentesDe(f.id)), []);
}

function montarCabecalhoCategoria() {
  const id = categoriaAtualId();
  const breadcrumb = document.getElementById('breadcrumb');
  const titulo = document.getElementById('categoria-titulo');
  const descricao = document.getElementById('categoria-descricao');
  const subcatContainer = document.getElementById('filtro-subcategorias');

  if (!id) {
    titulo.textContent = 'Catálogo Completo';
    descricao.textContent = 'Confira todos os produtos disponíveis na Essencial Barber.';
    document.title = 'Catálogo Completo | Essencial Barber';
    subcatContainer.innerHTML = '';
    return;
  }

  const categoria = TODAS_CATEGORIAS.find((c) => String(c.id) === String(id));
  if (!categoria) {
    titulo.textContent = 'Categoria não encontrada';
    return;
  }

  document.title = `${categoria.nome} | Essencial Barber`;
  titulo.textContent = categoria.nome;
  descricao.textContent = `Confira todos os produtos da categoria ${categoria.nome}.`;

  // Breadcrumb (Home > [Categoria Mãe >] Categoria Atual)
  let caminho = [categoria];
  let atual = categoria;
  while (atual.paiId) {
    const pai = TODAS_CATEGORIAS.find((c) => String(c.id) === String(atual.paiId));
    if (!pai) break;
    caminho.unshift(pai);
    atual = pai;
  }
  breadcrumb.innerHTML = '<a href="index.html">Home</a>' +
    caminho.map((c) => ` &raquo; <a href="categoria.html?id=${c.id}">${escapeHtml(c.nome)}</a>`).join('');

  // Subcategorias (se houver)
  const filhas = TODAS_CATEGORIAS.filter((c) => String(c.paiId) === String(id) && c.status !== 'inativa');
  if (filhas.length > 0) {
    subcatContainer.innerHTML = `
      <div class="filtro-grupo">
        <h4>Subcategorias</h4>
        ${filhas.map((f) => `<label><a href="categoria.html?id=${f.id}" style="color:inherit; text-decoration:none;">${escapeHtml(f.nome)}</a></label>`).join('')}
      </div>
    `;
  } else {
    subcatContainer.innerHTML = '';
  }
}

function produtosDaCategoriaAtual() {
  const id = categoriaAtualId();
  const busca = (getQueryParam('busca') || document.getElementById('input-busca-header').value || '').toLowerCase().trim();

  let lista = TODOS_PRODUTOS.filter((p) => p.status !== 'inativo');

  if (id) {
    const idsValidos = [Number(id), ...descendentesDe(id)].map(String);
    lista = lista.filter((p) => idsValidos.includes(String(p.categoriaId)));
  }

  if (busca) {
    lista = lista.filter((p) =>
      (p.nome || '').toLowerCase().includes(busca) ||
      (p.descricao || '').toLowerCase().includes(busca) ||
      (p.sku || '').toLowerCase().includes(busca)
    );
  }

  return lista;
}

// ---------------------------------------------------------------------------
// Filtros de atributo, derivados das variações reais dos produtos (ex: "Cor")
// ---------------------------------------------------------------------------
async function montarFiltroAtributos() {
  const produtos = produtosDaCategoriaAtual().slice(0, 60); // limite de segurança
  const grupos = {}; // { "Cor": Set(["Preto", ...]) }

  await Promise.all(produtos.map(async (p) => {
    try {
      const variacoes = await fetch(`${API_BASE}/produtos/${p.id}/variacoes`).then((r) => r.json());
      variacoes.forEach((v) => {
        const partes = (v.nome || '').split(':');
        if (partes.length < 2) return;
        const atributo = partes[0].trim();
        const valor = partes.slice(1).join(':').trim();
        if (!atributo || !valor) return;
        if (!grupos[atributo]) grupos[atributo] = new Set();
        grupos[atributo].add(valor);
      });
    } catch (err) { /* silencioso: produto sem variação */ }
  }));

  const container = document.getElementById('filtros-atributos');
  const chaves = Object.keys(grupos);
  if (chaves.length === 0) { container.innerHTML = ''; return; }

  container.innerHTML = chaves.map((atributo) => `
    <div class="filtro-grupo">
      <h4>${escapeHtml(atributo)}</h4>
      ${Array.from(grupos[atributo]).map((valor) => `
        <label>
          <input type="checkbox" onchange="toggleAtributo('${escapeHtml(atributo)}','${escapeHtml(valor)}', this.checked)">
          ${escapeHtml(valor)}
        </label>
      `).join('')}
    </div>
  `).join('');
}

function toggleAtributo(atributo, valor, marcado) {
  if (!ATRIBUTOS_SELECIONADOS[atributo]) ATRIBUTOS_SELECIONADOS[atributo] = new Set();
  if (marcado) ATRIBUTOS_SELECIONADOS[atributo].add(valor);
  else ATRIBUTOS_SELECIONADOS[atributo].delete(valor);
  aplicarFiltros();
}

// ---------------------------------------------------------------------------
// Aplica filtros de preço/estoque/atributos + ordenação, e renderiza a grade
// ---------------------------------------------------------------------------
function aplicarFiltros() {
  let lista = produtosDaCategoriaAtual();

  const min = parseFloat(document.getElementById('filtro-preco-min').value);
  const max = parseFloat(document.getElementById('filtro-preco-max').value);
  const somenteEstoque = document.getElementById('filtro-em-estoque').checked;

  if (!isNaN(min)) lista = lista.filter((p) => precoFinal(p) >= min);
  if (!isNaN(max)) lista = lista.filter((p) => precoFinal(p) <= max);
  if (somenteEstoque) lista = lista.filter((p) => (p.estoque || 0) > 0);

  const ordenacao = document.getElementById('select-ordenacao').value;
  if (ordenacao === 'menor-preco') lista.sort((a, b) => precoFinal(a) - precoFinal(b));
  else if (ordenacao === 'maior-preco') lista.sort((a, b) => precoFinal(b) - precoFinal(a));
  else if (ordenacao === 'lancamentos') lista.sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0));
  // "mais-vendidos" ainda não tem dado real de vendas por item (isso chega
  // quando os pedidos passarem a ter itens estruturados) — por enquanto
  // cai na ordem padrão (relevância), sem inventar número de vendas.

  document.getElementById('contador-resultados').textContent = `${lista.length} produto(s) encontrado(s)`;

  const grid = document.getElementById('grid-categoria');
  grid.innerHTML = lista.length
    ? lista.map(montarCardProduto).join('')
    : '<div class="empty-msg">Nenhum produto encontrado com esses filtros.</div>';
}
