// ============================================================================
// Essencial Barber - Loja (biblioteca compartilhada entre Home, Categoria e Produto)
// ============================================================================
// API_BASE agora vem de js/config.js (carregado antes deste arquivo)
const WHATSAPP_NUMBER = '5591999999999'; // TODO: troque pelo número real da loja
const PARCELAS_PADRAO = 3; // exibição ilustrativa; parcelamento real vem com o gateway de pagamento (fase futura)

let CART = JSON.parse(localStorage.getItem('cart') || '[]');
let CURRENT_USER = JSON.parse(localStorage.getItem('storeUser') || 'null');
let CATEGORIAS_LOJA = [];

document.addEventListener('DOMContentLoaded', () => {
  updateCartBadge();
  updateLoginButton();
  carregarCategoriasNav();
  initBuscaHeader();

  // A Home cuida de carregar seus próprios produtos (js/loja-home.js);
  // aqui só garantimos que uma grade simples não quebre caso exista uma
  // página com #products-container sem script próprio.
  if (document.getElementById('products-container') && typeof initHomeLoja !== 'function') {
    loadProdutosGenerico();
  }
});

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------
function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function getQueryParam(nome) {
  return new URLSearchParams(window.location.search).get(nome);
}

function precoFinal(produto) {
  return produto.precoPromocional && produto.precoPromocional > 0 ? produto.precoPromocional : produto.preco;
}

function htmlParcelamento(produto) {
  const valor = precoFinal(produto) / PARCELAS_PADRAO;
  if (valor < 5) return '';
  return `ou ${PARCELAS_PADRAO}x de ${formatCurrency(valor)} sem juros`;
}

// Card de produto reutilizado na Home, na Categoria e nos "relacionados" da Produto
function montarCardProduto(p) {
  const promo = p.precoPromocional && p.precoPromocional > 0;
  return `
    <div class="product-card">
      ${promo ? '<span class="badge-promo">Oferta</span>' : ''}
      <a class="card-link" href="produto.html?id=${p.id}">
        <img src="${p.imagem || 'https://via.placeholder.com/300x220?text=Produto'}" alt="${escapeHtml(p.nome)}">
        <div class="info">
          <div class="name">${escapeHtml(p.nome)}</div>
          ${promo ? `<div class="price-old">${formatCurrency(p.preco)}</div>` : ''}
          <div class="price">${formatCurrency(precoFinal(p))}</div>
          <div class="installments">${htmlParcelamento(p)}</div>
        </div>
      </a>
      <button class="btn" onclick="addToCart(${p.id})">Adicionar ao Carrinho</button>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Navegação de categorias (menu escuro abaixo do header, em todas as páginas)
// ---------------------------------------------------------------------------
async function carregarCategoriasNav() {
  const nav = document.getElementById('category-nav-list');
  if (!nav) return;
  try {
    const categorias = await fetch(`${API_BASE}/categorias`).then((r) => r.json());
    CATEGORIAS_LOJA = categorias.filter((c) => c.status !== 'inativa');
    const principais = CATEGORIAS_LOJA.filter((c) => !c.paiId);
    nav.innerHTML = principais.map((c) => `<a href="categoria.html?id=${c.id}">${escapeHtml(c.nome)}</a>`).join('');
  } catch (err) {
    console.error('Erro ao carregar categorias do menu', err);
  }
}

function subcategoriasDe(categoriaId) {
  return CATEGORIAS_LOJA.filter((c) => String(c.paiId) === String(categoriaId));
}

// ---------------------------------------------------------------------------
// Busca (campo do header)
// ---------------------------------------------------------------------------
function initBuscaHeader() {
  const form = document.getElementById('form-busca-header');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const termo = document.getElementById('input-busca-header').value.trim();
    if (!termo) return;
    window.location.href = `categoria.html?busca=${encodeURIComponent(termo)}`;
  });
}

// ---------------------------------------------------------------------------
// Fallback simples (só usado se alguma página tiver #products-container
// sem um script próprio de página)
// ---------------------------------------------------------------------------
async function loadProdutosGenerico() {
  const container = document.getElementById('products-container');
  try {
    const produtos = await fetch(`${API_BASE}/produtos`).then((r) => r.json());
    const ativos = produtos.filter((p) => p.status !== 'inativo');
    container.innerHTML = ativos.length
      ? `<div class="product-grid">${ativos.map(montarCardProduto).join('')}</div>`
      : '<p class="empty-msg">Nenhum produto disponível no momento.</p>';
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p class="empty-msg">Não foi possível carregar os produtos agora.</p>';
  }
}

// ---------------------------------------------------------------------------
// Carrinho
// ---------------------------------------------------------------------------
function saveCart() {
  localStorage.setItem('cart', JSON.stringify(CART));
  updateCartBadge();
}

async function addToCart(produtoId, opcoes = {}) {
  try {
    const produto = await fetch(`${API_BASE}/produtos/${produtoId}`).then((r) => r.json());
    const chaveItem = produtoId + (opcoes.variacaoId ? `-${opcoes.variacaoId}` : '');
    const item = CART.find((i) => i.chave === chaveItem);
    const precoUnit = precoFinal(produto) + (opcoes.precoAdicional || 0);

    if (item) {
      item.qty += 1;
    } else {
      CART.push({
        chave: chaveItem, id: produto.id, variacaoId: opcoes.variacaoId || null,
        nome: produto.nome + (opcoes.variacaoNome ? ` (${opcoes.variacaoNome})` : ''),
        preco: precoUnit, qty: 1
      });
    }
    saveCart();
    openCartModal();
  } catch (err) {
    console.error('Erro ao adicionar ao carrinho', err);
  }
}

function changeQty(chave, delta) {
  const item = CART.find((i) => i.chave === chave);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) CART = CART.filter((i) => i.chave !== chave);
  saveCart();
  renderCart();
}

function removeFromCart(chave) {
  CART = CART.filter((i) => i.chave !== chave);
  saveCart();
  renderCart();
}

function cartTotal() {
  return CART.reduce((sum, i) => sum + i.preco * i.qty, 0);
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (badge) badge.textContent = CART.reduce((sum, i) => sum + i.qty, 0);
}

function renderCart() {
  const itemsEl = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total');
  if (!itemsEl) return;

  if (CART.length === 0) {
    itemsEl.innerHTML = '<p class="empty-msg">Seu carrinho está vazio.</p>';
  } else {
    itemsEl.innerHTML = CART.map((i) => `
      <div class="cart-item">
        <div>
          <div>${escapeHtml(i.nome)}</div>
          <small>${formatCurrency(i.preco)} un.</small>
        </div>
        <div class="qty-controls">
          <button onclick="changeQty('${i.chave}', -1)">-</button>
          <span>${i.qty}</span>
          <button onclick="changeQty('${i.chave}', 1)">+</button>
          <span class="remove-btn" onclick="removeFromCart('${i.chave}')">Remover</span>
        </div>
      </div>
    `).join('');
  }
  totalEl.textContent = formatCurrency(cartTotal());
}

function openCartModal() {
  renderCart();
  document.getElementById('cart-modal').classList.add('open');
}

function closeCartModal() {
  document.getElementById('cart-modal').classList.remove('open');
}

// ---------------------------------------------------------------------------
// Login / Identificação do cliente (via WhatsApp)
// ---------------------------------------------------------------------------
function openLoginModal() {
  if (CURRENT_USER) {
    alert(`Você já está identificado como ${CURRENT_USER.nome}.`);
    return;
  }
  document.getElementById('login-modal').classList.add('open');
}

function closeLoginModal() {
  document.getElementById('login-modal').classList.remove('open');
}

async function handleLogin(event) {
  event.preventDefault();
  const nome = document.getElementById('login-name').value.trim();
  const whatsapp = document.getElementById('login-whatsapp').value.trim();

  try {
    const res = await fetch(`${API_BASE}/loja/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, whatsapp })
    });
    if (!res.ok) throw new Error('Falha no login');
    CURRENT_USER = await res.json();
    localStorage.setItem('storeUser', JSON.stringify(CURRENT_USER));
    updateLoginButton();
    closeLoginModal();
  } catch (err) {
    console.error(err);
    alert('Não foi possível concluir o login. Tente novamente.');
  }
}

function updateLoginButton() {
  const btn = document.getElementById('login-nav-btn');
  if (!btn) return;
  btn.textContent = CURRENT_USER ? CURRENT_USER.nome : 'Minha Conta';
}

// ---------------------------------------------------------------------------
// Checkout (gera o pedido na API e abre o WhatsApp com o resumo)
// ---------------------------------------------------------------------------
async function checkout() {
  if (CART.length === 0) {
    alert('Seu carrinho está vazio.');
    return;
  }
  if (!CURRENT_USER) {
    closeCartModal();
    openLoginModal();
    alert('Identifique-se antes de finalizar o pedido.');
    return;
  }

  const total = cartTotal();
  const observacoes = CART.map((i) => `${i.qty}x ${i.nome}`).join(', ');
  const itens = CART.map((i) => ({
    produtoId: i.id, variacaoId: i.variacaoId || null, nome: i.nome, quantidade: i.qty, precoUnitario: i.preco
  }));

  try {
    const pedido = await fetch(`${API_BASE}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: CURRENT_USER.id, status: 'recebido', total, observacoes, itens,
        origem: 'catalogo-online', criadoEm: new Date().toISOString()
      })
    }).then((r) => r.json());

    // O carrinho já cumpriu seu papel (virou pedido) — limpa antes de sair da página
    CART = [];
    saveCart();

    window.location.href = `checkout.html?pedido=${pedido.id}`;
  } catch (err) {
    console.error('Erro ao registrar pedido', err);
    alert('Não foi possível iniciar o pagamento. Tente novamente.');
  }
}
