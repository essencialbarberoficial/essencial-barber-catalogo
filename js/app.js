// ============================================================================
// Essencial Barber - Loja (biblioteca compartilhada entre Home, Categoria e Produto)
// ============================================================================
// API_BASE agora vem de js/config.js (carregado antes deste arquivo)
let WHATSAPP_NUMBER = '5591999999999'; // valor padrão até a configuração real carregar
let WHATSAPP_ATIVO = true;
let WHATSAPP_MENSAGEM_PADRAO = 'Olá! Vim através do catálogo e gostaria de acompanhar meu pedido.';
const PARCELAS_PADRAO = 3; // exibição ilustrativa; parcelamento real vem com o gateway de pagamento (fase futura)

let CART = JSON.parse(localStorage.getItem('cart') || '[]');
let CURRENT_USER = JSON.parse(localStorage.getItem('storeUser') || 'null');
let CATEGORIAS_LOJA = [];

// Fase 24 — sessão da Área de Usuário (login com senha), completamente
// separada do CURRENT_USER acima (identificação simples, sem senha,
// usada só no checkout rápido). As duas coisas coexistem: dá pra estar
// "identificado" pro checkout sem ter uma conta com senha, e vice-versa.
let CONTA_CLIENTE = (() => {
  const token = localStorage.getItem('contaClienteToken');
  const infoRaw = localStorage.getItem('contaClienteInfo');
  if (!token || !infoRaw) return null;
  try { return { token, info: JSON.parse(infoRaw) }; } catch (e) { return null; }
})();

document.addEventListener('DOMContentLoaded', () => {
  updateCartBadge();
  updateLoginButton();
  carregarCategoriasNav();
  carregarCategoriasMenuLateral();
  initBuscaHeader();
  carregarConfiguracoesDaLoja();

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
        <div class="product-card-imagem-wrap">
          <img src="${p.imagem || 'https://via.placeholder.com/300x220?text=Produto'}" alt="${escapeHtml(p.nome)}">
          <button class="btn-icone-carrinho" onclick="event.preventDefault(); event.stopPropagation(); addToCart(${p.id});" aria-label="Adicionar ao carrinho" title="Adicionar ao carrinho"><i class="fa-solid fa-cart-plus"></i></button>
        </div>
        <div class="info">
          <div class="name">${escapeHtml(p.nome)}</div>
          ${promo ? `<div class="price-old">${formatCurrency(p.preco)}</div>` : ''}
          <div class="price">${formatCurrency(precoFinal(p))}</div>
          <div class="installments">${htmlParcelamento(p)}</div>
        </div>
      </a>
      <button class="btn" onclick="comprarAgora(${p.id})">Comprar</button>
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

// ---------------------------------------------------------------------------
// Fase 22 — Menu lateral (celular): mesmas categorias do cabeçalho, só que
// numa "gaveta" que desliza da esquerda, com sanfona pra subcategorias —
// evita repetir a navegação de categorias em dois lugares na tela.
// ---------------------------------------------------------------------------
function abrirMenuLateral() {
  document.getElementById('menu-lateral').classList.add('aberto');
  document.getElementById('overlay-menu-lateral').classList.add('visivel');
  document.body.style.overflow = 'hidden';
}

function fecharMenuLateral() {
  document.getElementById('menu-lateral').classList.remove('aberto');
  document.getElementById('overlay-menu-lateral').classList.remove('visivel');
  document.body.style.overflow = '';
}

function alternarSubcategoriasMenu(id) {
  const linha = document.getElementById(`subcats-menu-${id}`);
  const seta = document.getElementById(`seta-menu-${id}`);
  if (!linha) return;
  const abrindo = !linha.classList.contains('aberta');
  linha.classList.toggle('aberta', abrindo);
  if (seta) seta.style.transform = abrindo ? 'rotate(90deg)' : 'rotate(0deg)';
}

async function carregarCategoriasMenuLateral() {
  const container = document.getElementById('menu-lateral-categorias');
  if (!container) return;

  try {
    const categorias = CATEGORIAS_LOJA.length ? CATEGORIAS_LOJA : await fetch(`${API_BASE}/categorias`).then((r) => r.json());
    const principais = categorias.filter((c) => !c.paiId && c.status !== 'inativa');

    if (principais.length === 0) {
      container.innerHTML = '<div class="empty-msg" style="padding:16px;">Nenhuma categoria cadastrada.</div>';
      return;
    }

    container.innerHTML = principais.map((cat) => {
      const subcategorias = categorias.filter((c) => String(c.paiId) === String(cat.id) && c.status !== 'inativa');
      return `
        <div class="item-categoria-menu">
          <a href="categoria.html?id=${cat.id}" class="item-categoria-menu-nome">${escapeHtml(cat.nome)}</a>
          ${subcategorias.length ? `
            <button class="item-categoria-menu-seta" id="seta-menu-${cat.id}" onclick="alternarSubcategoriasMenu(${cat.id})" aria-label="Expandir subcategorias">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
          ` : ''}
        </div>
        ${subcategorias.length ? `
          <div class="subcategorias-menu" id="subcats-menu-${cat.id}">
            ${subcategorias.map((sub) => `<a href="categoria.html?id=${sub.id}">${escapeHtml(sub.nome)}</a>`).join('')}
          </div>
        ` : ''}
      `;
    }).join('');
  } catch (err) {
    console.error('Erro ao carregar categorias do menu lateral', err);
    container.innerHTML = '<div class="empty-msg" style="padding:16px;">Não foi possível carregar as categorias.</div>';
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
    // Igual na página do produto: preço da variação é o preço final dela,
    // não uma soma com o preço do produto principal.
    const precoUnit = (opcoes.precoAdicional && opcoes.precoAdicional > 0) ? opcoes.precoAdicional : precoFinal(produto);

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
  } catch (err) {
    console.error('Erro ao adicionar ao carrinho', err);
  }
}

// ---------------------------------------------------------------------------
// "Comprar" — compra avulsa: cria o pedido só com ESSE produto (ignora
// qualquer coisa que já esteja no carrinho) e manda direto pro checkout,
// sem passar pelo modal do carrinho. Usada tanto pelo card de produto
// (Home/Categoria/Relacionados) quanto pelo botão da Ficha de Produto.
// ---------------------------------------------------------------------------
async function comprarAgora(produtoId, opcoes = {}) {
  try {
    const produto = await fetch(`${API_BASE}/produtos/${produtoId}`).then((r) => { if (!r.ok) throw new Error('não encontrado'); return r.json(); });
    const precoUnit = (opcoes.precoAdicional && opcoes.precoAdicional > 0) ? opcoes.precoAdicional : precoFinal(produto);
    const nomeItem = produto.nome + (opcoes.variacaoNome ? ` (${opcoes.variacaoNome})` : '');

    // Fase 25 — não cria o pedido aqui mais. Só guarda o item e manda pro
    // checkout, que coleta os dados completos (CPF, nascimento, etc.) na
    // Etapa 0 antes de criar o pedido de verdade.
    localStorage.setItem('buyNowItem', JSON.stringify({
      id: produto.id, variacaoId: opcoes.variacaoId || null, nome: nomeItem, preco: precoUnit, qty: 1
    }));
    window.location.href = 'checkout.html';
  } catch (err) {
    console.error('Erro ao iniciar compra direta', err);
    alert('Não foi possível iniciar a compra agora. Tente novamente.');
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

let CUPOM_APLICADO = null; // { codigo, tipo, valor, desconto }
let VENDEDOR_APLICADO = null; // { vendedorId, nome }

// Troca o campo de "código do vendedor" (texto livre, fácil de esquecer)
// por um select de verdade, puxado direto do cadastro de vendedores —
// só roda uma vez, na primeira vez que o carrinho é aberto.
async function garantirSelectVendedorCarrinho() {
  const inputAntigo = document.getElementById('cart-vendedor-input');
  if (!inputAntigo || inputAntigo.tagName === 'SELECT') {
    if (inputAntigo) await preencherSelectVendedorCarrinho(inputAntigo);
    return;
  }

  const select = document.createElement('select');
  select.id = 'cart-vendedor-input';
  select.className = inputAntigo.className;
  select.style.cssText = inputAntigo.style.cssText;
  select.onchange = selecionarVendedorCarrinho;
  inputAntigo.replaceWith(select);
  await preencherSelectVendedorCarrinho(select);
}

async function preencherSelectVendedorCarrinho(select) {
  try {
    const vendedores = await fetch(`${API_BASE}/loja/vendedores`).then((r) => r.json());
    const valorAtual = select.value;
    select.innerHTML = '<option value="">Nenhum vendedor específico</option>' +
      vendedores.map((v) => `<option value="${v.id}">${escapeHtml(v.nome)}</option>`).join('');
    select.value = valorAtual;
  } catch (err) {
    console.error('Erro ao carregar vendedores', err);
  }
}

function selecionarVendedorCarrinho() {
  const select = document.getElementById('cart-vendedor-input');
  const mensagem = document.getElementById('cart-vendedor-mensagem');
  if (!select.value) {
    VENDEDOR_APLICADO = null;
    if (mensagem) mensagem.innerHTML = '';
    return;
  }
  const nomeEscolhido = select.options[select.selectedIndex].textContent;
  VENDEDOR_APLICADO = { vendedorId: select.value, nome: nomeEscolhido };
  if (mensagem) mensagem.innerHTML = `<span style="color:var(--success-color, #16a34a);">✅ Atendido por ${escapeHtml(nomeEscolhido)}</span>`;
}

async function aplicarCupomCarrinho() {
  const input = document.getElementById('cart-cupom-input');
  const mensagem = document.getElementById('cart-cupom-mensagem');
  const codigo = input.value.trim();

  if (!codigo) { mensagem.innerHTML = ''; return; }
  mensagem.innerHTML = '<span style="color:var(--text-muted);">Verificando...</span>';

  try {
    const resposta = await fetch(`${API_BASE}/cupons/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, clienteId: CURRENT_USER ? CURRENT_USER.id : null, valorPedido: cartTotal() })
    });
    const dados = await resposta.json();

    if (!dados.valido) {
      CUPOM_APLICADO = null;
      mensagem.innerHTML = `<span style="color:var(--danger-color, #dc2626);">❌ ${escapeHtml(dados.motivo)}</span>`;
    } else {
      CUPOM_APLICADO = dados;
      mensagem.innerHTML = `<span style="color:var(--success-color, #16a34a);">✅ Cupom "${escapeHtml(dados.codigo)}" aplicado!</span>`;
    }
    renderCart();
  } catch (err) {
    console.error('Erro ao validar cupom', err);
    mensagem.innerHTML = '<span style="color:var(--danger-color, #dc2626);">Erro ao validar cupom.</span>';
  }
}

function totalComDesconto() {
  const subtotal = cartTotal();
  const desconto = CUPOM_APLICADO ? Math.min(CUPOM_APLICADO.desconto, subtotal) : 0;
  return { subtotal, desconto, total: subtotal - desconto };
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (badge) badge.textContent = CART.reduce((sum, i) => sum + i.qty, 0);
}

function renderCart() {
  const itemsEl = document.getElementById('cart-items');
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

  const { subtotal, desconto, total } = totalComDesconto();
  document.getElementById('cart-subtotal').textContent = formatCurrency(subtotal);
  document.getElementById('cart-total').textContent = formatCurrency(total);

  const linhaDesconto = document.getElementById('cart-linha-desconto');
  if (desconto > 0) {
    linhaDesconto.style.display = 'flex';
    document.getElementById('cart-desconto').textContent = '- ' + formatCurrency(desconto);
  } else {
    linhaDesconto.style.display = 'none';
  }
}

function openCartModal() {
  renderCart();
  garantirSelectVendedorCarrinho();
  document.getElementById('cart-modal').classList.add('open');
}

function closeCartModal() {
  document.getElementById('cart-modal').classList.remove('open');
}

// ---------------------------------------------------------------------------
// Validação de CPF/CNPJ (algoritmo oficial de dígito verificador) — usada
// na Etapa 0 do checkout novo, pra evitar erro de digitação antes mesmo
// de consultar o servidor.
// ---------------------------------------------------------------------------
function validarCPF(cpf) {
  cpf = (cpf || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(cpf[10]);
}

function validarCNPJ(cnpj) {
  cnpj = (cnpj || '').replace(/\D/g, '');
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calcularDigito = (base, pesos) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += parseInt(base[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const dv1 = calcularDigito(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = calcularDigito(cnpj.slice(0, 12) + dv1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.slice(12) === `${dv1}${dv2}`;
}

function documentoValidoOuVazio(valor) {
  const digitos = (valor || '').replace(/\D/g, '');
  if (!digitos) return true;
  if (digitos.length === 11) return validarCPF(digitos);
  if (digitos.length === 14) return validarCNPJ(digitos);
  return false;
}

async function carregarConfiguracoesDaLoja() {
  try {
    const config = await fetch(`${API_BASE}/config`).then((r) => r.json());

    if (config.whatsappNumero) WHATSAPP_NUMBER = config.whatsappNumero;
    WHATSAPP_ATIVO = config.whatsappAtivo !== '0';
    if (config.whatsappMensagem) WHATSAPP_MENSAGEM_PADRAO = config.whatsappMensagem;

    // Esconde qualquer botão de WhatsApp da página se estiver desativado
    // no painel (usa uma classe compartilhada pra não precisar caçar
    // botão por botão em cada tela).
    if (!WHATSAPP_ATIVO) {
      document.querySelectorAll('.btn-whatsapp-loja').forEach((el) => { el.style.display = 'none'; });
    }

    const logoContainer = document.getElementById('logo-catalogo-container');
    if (logoContainer && config.catalogoLogoBase64) {
      document.getElementById('logo-catalogo-img').src = config.catalogoLogoBase64;
      logoContainer.style.display = 'block';
    }
  } catch (err) {
    console.error('Erro ao carregar configurações da loja', err);
  }
}

// O botão "Minha Conta" agora é só ícone, sem nome — não tem mais texto
// pra trocar. Mantida como função vazia (só pra não quebrar chamadas que
// ainda existam) — o comportamento de clique já é tratado por
// handleCliqueMinhaConta().
function updateLoginButton() {}

// Clique no botão "Minha Conta" do header — se já tem sessão de conta de
// verdade (com senha), vai direto pra área logada; senão, abre o login
// com senha (diferente do modal de identificação simples do checkout).
function handleCliqueMinhaConta() {
  if (CONTA_CLIENTE) {
    window.location.href = 'minha-conta.html';
  } else {
    openContaModal();
  }
}

// ---------------------------------------------------------------------------
// Checkout (gera o pedido na API e abre o WhatsApp com o resumo)
// ---------------------------------------------------------------------------
async function checkout() {
  if (CART.length === 0) {
    alert('Seu carrinho está vazio.');
    return;
  }

  // Fase 25 — não cria mais o pedido aqui, e não pede identificação antes
  // de seguir (isso derrubava a conversão sem necessidade — a compra
  // nunca fica bloqueada esperando login). O carrinho (já salvo em
  // localStorage) e o cupom/vendedor aplicados são lidos pela Etapa 0 do
  // checkout, que coleta os dados completos antes de criar o pedido de
  // verdade.
  if (CUPOM_APLICADO) localStorage.setItem('cupomAplicadoCheckout', JSON.stringify(CUPOM_APLICADO));
  else localStorage.removeItem('cupomAplicadoCheckout');

  if (VENDEDOR_APLICADO) localStorage.setItem('vendedorAplicadoCheckout', JSON.stringify(VENDEDOR_APLICADO));
  else localStorage.removeItem('vendedorAplicadoCheckout');

  closeCartModal();
  window.location.href = 'checkout.html';
}

// ---------------------------------------------------------------------------
// Fase 24 — Área de Usuário (login com senha). Modal separado do
// login-modal de identificação simples (que continua existindo, sem
// mudar nada, pro checkout rápido).
// ---------------------------------------------------------------------------
function openContaModal() {
  mostrarEtapaConta('entrar');
  document.getElementById('conta-modal').classList.add('open');
}

function closeContaModal() {
  document.getElementById('conta-modal').classList.remove('open');
}

function mostrarEtapaConta(etapa) {
  ['entrar', 'cadastrar', 'ativar', 'esqueci'].forEach((e) => {
    const el = document.getElementById(`conta-etapa-${e}`);
    if (el) el.style.display = e === etapa ? 'block' : 'none';
  });
}

function salvarSessaoConta(dados) {
  CONTA_CLIENTE = { token: dados.token, info: { id: dados.id, nome: dados.nome, email: dados.email } };
  localStorage.setItem('contaClienteToken', dados.token);
  localStorage.setItem('contaClienteInfo', JSON.stringify(CONTA_CLIENTE.info));
}

function sairDaConta() {
  if (!confirm('Deseja sair da sua conta?')) return;
  CONTA_CLIENTE = null;
  localStorage.removeItem('contaClienteToken');
  localStorage.removeItem('contaClienteInfo');
  window.location.href = 'index.html';
}

async function handleEntrarConta(event) {
  event.preventDefault();
  const identificador = document.getElementById('conta-entrar-identificador').value.trim();
  const senha = document.getElementById('conta-entrar-senha').value;
  const erroEl = document.getElementById('conta-entrar-erro');
  erroEl.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/loja/conta/entrar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identificador, senha })
    });
    const dados = await res.json();
    if (!res.ok) { erroEl.textContent = dados.error || 'Não foi possível entrar.'; return; }

    salvarSessaoConta(dados);
    closeContaModal();
    window.location.href = 'minha-conta.html';
  } catch (err) {
    console.error('Erro ao entrar na conta', err);
    erroEl.textContent = 'Erro ao conectar. Tente novamente.';
  }
}

async function handleCadastrarConta(event) {
  event.preventDefault();
  const nome = document.getElementById('conta-cad-nome').value.trim();
  const email = document.getElementById('conta-cad-email').value.trim();
  const telefone = document.getElementById('conta-cad-telefone').value.trim();
  const senha = document.getElementById('conta-cad-senha').value;
  const erroEl = document.getElementById('conta-cad-erro');
  erroEl.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/loja/conta/cadastrar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, telefone, senha })
    });
    const dados = await res.json();
    if (!res.ok) { erroEl.textContent = dados.error || 'Não foi possível criar a conta.'; return; }

    salvarSessaoConta(dados);
    closeContaModal();
    window.location.href = 'minha-conta.html';
  } catch (err) {
    console.error('Erro ao cadastrar conta', err);
    erroEl.textContent = 'Erro ao conectar. Tente novamente.';
  }
}

async function handleAtivarConta(event) {
  event.preventDefault();
  const identificador = document.getElementById('conta-ativar-identificador').value.trim();
  const senha = document.getElementById('conta-ativar-senha').value;
  const erroEl = document.getElementById('conta-ativar-erro');
  erroEl.textContent = '';

  const ehEmail = identificador.includes('@');
  const payload = ehEmail ? { email: identificador, senha } : { telefone: identificador.replace(/\D/g, ''), senha };

  try {
    const res = await fetch(`${API_BASE}/loja/conta/criar-senha`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const dados = await res.json();
    if (!res.ok) { erroEl.textContent = dados.error || 'Não foi possível criar a senha.'; return; }

    salvarSessaoConta(dados);
    closeContaModal();
    window.location.href = 'minha-conta.html';
  } catch (err) {
    console.error('Erro ao ativar conta', err);
    erroEl.textContent = 'Erro ao conectar. Tente novamente.';
  }
}

async function handleEsqueciSenhaConta(event) {
  event.preventDefault();
  const email = document.getElementById('conta-esq-email').value.trim();
  const msgEl = document.getElementById('conta-esq-msg');
  msgEl.style.color = '';
  msgEl.textContent = 'Enviando...';

  try {
    const dados = await fetch(`${API_BASE}/loja/conta/esqueci-senha`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    }).then((r) => r.json());
    msgEl.style.color = 'var(--success-color, #16a34a)';
    msgEl.textContent = dados.mensagem;
  } catch (err) {
    console.error('Erro ao pedir redefinição de senha', err);
    msgEl.style.color = 'var(--danger-color)';
    msgEl.textContent = 'Erro ao enviar. Tente novamente.';
  }
}
