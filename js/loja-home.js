// ============================================================================
// Essencial Barber - Home (js/loja-home.js)
// ============================================================================
function initHomeLoja() { /* marcador: avisa o app.js que esta página cuida dos próprios produtos */ }

document.addEventListener('DOMContentLoaded', () => {
  initHomeLoja();
  initCarrossel();
  carregarCategoriasGrid();
  carregarSecoesProdutos();
});

// ---------------------------------------------------------------------------
// Carrossel do banner principal
// ---------------------------------------------------------------------------
function initCarrossel() {
  const slides = document.querySelectorAll('.hero-slide');
  const dotsContainer = document.getElementById('hero-dots');
  if (slides.length === 0) return;

  dotsContainer.innerHTML = Array.from(slides).map((_, i) => `<span data-i="${i}" class="${i === 0 ? 'active' : ''}"></span>`).join('');
  const dots = dotsContainer.querySelectorAll('span');

  let atual = 0;
  function mostrar(i) {
    slides.forEach((s, idx) => s.classList.toggle('active', idx === i));
    dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
    atual = i;
  }
  dots.forEach((d) => d.addEventListener('click', () => mostrar(Number(d.dataset.i))));

  setInterval(() => mostrar((atual + 1) % slides.length), 6000);
}

// ---------------------------------------------------------------------------
// Grade de categorias (principais, direto do painel)
// ---------------------------------------------------------------------------
async function carregarCategoriasGrid() {
  const grid = document.getElementById('categorias-grid');
  try {
    const categorias = await fetch(`${API_BASE}/categorias`).then((r) => r.json());
    const principais = categorias.filter((c) => !c.paiId && c.status !== 'inativa');

    if (principais.length === 0) {
      grid.innerHTML = '<div class="empty-msg">Nenhuma categoria cadastrada ainda.</div>';
      return;
    }

    grid.innerHTML = principais.map((c) => `
      <a class="category-tile" href="categoria.html?id=${c.id}">
        <div class="icon">${escapeHtml(c.nome.charAt(0).toUpperCase())}</div>
        ${escapeHtml(c.nome)}
      </a>
    `).join('');
  } catch (err) {
    console.error('Erro ao carregar categorias', err);
    grid.innerHTML = '<div class="empty-msg">Não foi possível carregar as categorias.</div>';
  }
}

// ---------------------------------------------------------------------------
// Destaques / Ofertas / Lançamentos — tudo a partir dos produtos reais
// ---------------------------------------------------------------------------
async function carregarSecoesProdutos() {
  try {
    const produtos = await fetch(`${API_BASE}/produtos`).then((r) => r.json());
    const ativos = produtos.filter((p) => p.status !== 'inativo');

    renderGrid('grid-destaques', ativos.slice(0, 8));

    const ofertas = ativos.filter((p) => p.precoPromocional && p.precoPromocional > 0);
    renderGrid('grid-ofertas', ofertas.length ? ofertas.slice(0, 8) : ativos.slice(0, 4), 'Nenhuma oferta no momento.');

    const lancamentos = [...ativos].sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0));
    renderGrid('grid-lancamentos', lancamentos.slice(0, 8));
  } catch (err) {
    console.error('Erro ao carregar produtos da home', err);
    ['grid-destaques', 'grid-ofertas', 'grid-lancamentos'].forEach((id) => {
      document.getElementById(id).innerHTML = '<div class="empty-msg">Não foi possível carregar os produtos.</div>';
    });
  }
}

function renderGrid(elementId, lista, mensagemVazio = 'Nenhum produto disponível.') {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = lista.length ? lista.map(montarCardProduto).join('') : `<div class="empty-msg">${mensagemVazio}</div>`;
}
