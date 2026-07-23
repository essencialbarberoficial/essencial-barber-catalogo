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

let CUPOM_APLICADO = null; // { codigo, tipo, valor, desconto }

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
  document.getElementById('identificacao-etapa-1').style.display = 'block';
  document.getElementById('identificacao-etapa-2').style.display = 'none';
  document.getElementById('login-modal').classList.add('open');
}

function closeLoginModal() {
  document.getElementById('login-modal').classList.remove('open');
}

function voltarParaIdentificacao() {
  document.getElementById('identificacao-etapa-1').style.display = 'block';
  document.getElementById('identificacao-etapa-2').style.display = 'none';
}

// ---------------------------------------------------------------------------
// Validação de CPF/CNPJ (algoritmo oficial de dígito verificador) — evita
// erro de digitação antes mesmo de consultar o servidor.
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
  if (!digitos) return true; // campo opcional na Etapa 1
  if (digitos.length === 11) return validarCPF(digitos);
  if (digitos.length === 14) return validarCNPJ(digitos);
  return false;
}

// ---------------------------------------------------------------------------
// ETAPA 1 — Identificação: procura o cliente por e-mail, CPF/CNPJ ou
// telefone. Se já existir, pula direto pro checkout. Se não existir, mostra
// a Etapa 2 pra completar o cadastro.
// ---------------------------------------------------------------------------
async function handleIdentificacao(event) {
  event.preventDefault();
  const erroEl = document.getElementById('ident-erro');
  erroEl.textContent = '';

  const email = document.getElementById('ident-email').value.trim();
  const documento = document.getElementById('ident-documento').value.trim();
  const telefone = document.getElementById('ident-telefone').value.trim();

  if (!email && !documento && !telefone) {
    erroEl.textContent = 'Informe ao menos um dado (e-mail, CPF/CNPJ ou telefone).';
    return;
  }
  if (documento && !documentoValidoOuVazio(documento)) {
    erroEl.textContent = 'CPF/CNPJ inválido. Confira os números digitados.';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/clientes/identificar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, documento, telefone })
    });
    const dados = await res.json();

    if (dados.existente) {
      definirUsuarioAtual(dados.cliente);
      closeLoginModal();
    } else {
      // Cliente novo — leva pra Etapa 2, já preenchendo o que a pessoa digitou
      document.getElementById('cad-documento').value = documento;
      document.getElementById('cad-telefone').value = telefone;
      document.getElementById('cad-email').value = email;
      document.getElementById('identificacao-etapa-1').style.display = 'none';
      document.getElementById('identificacao-etapa-2').style.display = 'block';
    }
  } catch (err) {
    console.error(err);
    erroEl.textContent = 'Não foi possível verificar seus dados. Tente novamente.';
  }
}

// ---------------------------------------------------------------------------
// ETAPA 2 — Dados do Cliente: cadastra o cliente novo. Isso cria o registro
// automaticamente em Clientes no painel ERP — é a mesma tabela, não existe
// um cadastro "só da loja" separado.
// ---------------------------------------------------------------------------
async function handleCadastro(event) {
  event.preventDefault();
  const erroEl = document.getElementById('cad-erro');
  erroEl.textContent = '';

  const documento = document.getElementById('cad-documento').value.trim();
  if (documento && !documentoValidoOuVazio(documento)) {
    erroEl.textContent = 'CPF inválido. Confira os números digitados.';
    return;
  }

  const payload = {
    nome: document.getElementById('cad-nome').value.trim(),
    sobrenome: document.getElementById('cad-sobrenome').value.trim(),
    documento,
    dataNascimento: document.getElementById('cad-nascimento').value,
    telefone: document.getElementById('cad-telefone').value.trim(),
    email: document.getElementById('cad-email').value.trim()
  };

  if (!payload.nome) { erroEl.textContent = 'Nome é obrigatório.'; return; }
  if (!payload.telefone && !payload.email) { erroEl.textContent = 'Informe ao menos telefone ou e-mail.'; return; }

  try {
    const res = await fetch(`${API_BASE}/clientes/cadastrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) { const erro = await res.json(); erroEl.textContent = erro.error || 'Erro ao cadastrar.'; return; }

    const cliente = await res.json();
    definirUsuarioAtual(cliente);
    closeLoginModal();
  } catch (err) {
    console.error(err);
    erroEl.textContent = 'Não foi possível concluir o cadastro. Tente novamente.';
  }
}

function definirUsuarioAtual(cliente) {
  CURRENT_USER = cliente;
  localStorage.setItem('storeUser', JSON.stringify(CURRENT_USER));
  updateLoginButton();
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

function updateLoginButton() {
  const span = document.querySelector('#login-nav-btn .texto-nav-desktop');
  if (!span) return;
  span.textContent = CURRENT_USER ? CURRENT_USER.nome : 'Minha Conta';
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

  const { total } = totalComDesconto();
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
        origem: 'catalogo-online', criadoEm: new Date().toISOString(),
        cupomCodigo: CUPOM_APLICADO ? CUPOM_APLICADO.codigo : null,
        valorDesconto: CUPOM_APLICADO ? CUPOM_APLICADO.desconto : 0
      })
    }).then((r) => r.json());

    // O carrinho já cumpriu seu papel (virou pedido) — limpa antes de sair da página
    CART = [];
    CUPOM_APLICADO = null;
    saveCart();

    window.location.href = `checkout.html?pedido=${pedido.id}`;
  } catch (err) {
    console.error('Erro ao registrar pedido', err);
    alert('Não foi possível iniciar o pagamento. Tente novamente.');
  }
}
