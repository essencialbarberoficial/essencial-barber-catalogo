// ============================================================================
// Essencial Barber - Ficha de Produto (js/loja-produto.js)
// ============================================================================
let PRODUTO_ATUAL = null;
let VARIACOES_ATUAL = [];
let VARIACAO_SELECIONADA = null;

document.addEventListener('DOMContentLoaded', async () => {
  const id = getQueryParam('id');
  const conteudo = document.getElementById('produto-conteudo');

  if (!id) {
    conteudo.innerHTML = '<div class="empty-msg">Produto não informado.</div>';
    return;
  }

  try {
    const [produto, categorias, variacoes] = await Promise.all([
      fetch(`${API_BASE}/produtos/${id}`).then((r) => { if (!r.ok) throw new Error('não encontrado'); return r.json(); }),
      fetch(`${API_BASE}/categorias`).then((r) => r.json()),
      fetch(`${API_BASE}/produtos/${id}/variacoes`).then((r) => r.json())
    ]);

    PRODUTO_ATUAL = produto;
    VARIACOES_ATUAL = variacoes;
    TODAS_CATEGORIAS_PRODUTO = categorias;

    montarBreadcrumbProduto(produto, categorias);
    renderizarProduto(produto, variacoes);
    carregarRelacionadosSemelhantes(produto, categorias);
  } catch (err) {
    console.error('Erro ao carregar produto', err);
    conteudo.innerHTML = '<div class="empty-msg">Produto não encontrado.</div>';
  }
});

function montarBreadcrumbProduto(produto, categorias) {
  const breadcrumb = document.getElementById('breadcrumb');
  const categoria = categorias.find((c) => String(c.id) === String(produto.categoriaId));
  let caminho = [];
  let atual = categoria;
  while (atual) {
    caminho.unshift(atual);
    atual = categorias.find((c) => String(c.id) === String(atual.paiId));
  }
  breadcrumb.innerHTML = '<a href="index.html">Home</a>' +
    caminho.map((c) => ` &raquo; <a href="categoria.html?id=${c.id}">${escapeHtml(c.nome)}</a>`).join('') +
    ` &raquo; ${escapeHtml(produto.nome)}`;
}

function renderizarProduto(p, variacoes) {
  document.title = `${p.nome} | Essencial Barber`;
  document.getElementById('page-title').textContent = `${p.nome} | Essencial Barber`;

  const promo = p.precoPromocional && p.precoPromocional > 0;
  const especificacoes = parseCaracteristicas(p.caracteristicas);

  document.getElementById('produto-conteudo').innerHTML = `
    <div class="produto-layout">
      <div class="produto-galeria">
        <img src="${p.imagem || 'https://via.placeholder.com/600x600?text=Produto'}" alt="${escapeHtml(p.nome)}">
      </div>
      <div class="produto-info">
        <h1>${escapeHtml(p.nome)}</h1>
        ${p.marca ? `<div class="produto-marca" style="font-size:13px; color:var(--text-muted); margin-bottom:6px;">Marca: <strong>${escapeHtml(p.marca)}</strong></div>` : ''}
        <div class="produto-sku">SKU: ${escapeHtml(p.sku || '—')} ${p.estoque > 0 ? '· <span style="color:var(--success-color)">Em estoque</span>' : '· <span style="color:var(--danger-color)">Sem estoque</span>'}</div>

        ${promo ? `<div class="produto-preco-old">${formatCurrency(p.preco)}</div>` : ''}
        <div class="produto-preco" id="produto-preco-exibido">${formatCurrency(precoFinal(p))}</div>
        <div class="produto-parcelas">${htmlParcelamento(p)}</div>

        ${variacoes.length ? `
          <div class="produto-variacoes">
            <h4 style="font-size:13px; margin-bottom:8px;">Opções</h4>
            <div id="opcoes-variacao">
              ${variacoes.map((v) => `<span class="opcao-variacao" data-id="${v.id}" onclick="selecionarVariacao(${v.id})">${escapeHtml(v.nome)}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        <div class="produto-acoes">
          <button class="btn" onclick="adicionarProdutoAoCarrinho()"><i class="fa-solid fa-cart-plus"></i> Comprar</button>
        </div>

        <div class="frete-widget">
          <h4 style="font-size:13px; margin-bottom:10px;">Calcular frete e prazo</h4>
          <div class="linha-cep">
            <input type="text" id="frete-cep" placeholder="Seu CEP (opcional)">
            <button class="btn-secondary btn" onclick="calcularFrete()">Calcular</button>
          </div>
          <div id="frete-resultado"></div>
        </div>

        <div class="produto-tabs">
          <div class="tab-buttons">
            <button class="active" onclick="mostrarTab('descricao', this)">Descrição</button>
            <button onclick="mostrarTab('especificacoes', this)">Especificações Técnicas</button>
          </div>
          <div class="tab-panel active" id="tab-descricao">${escapeHtml(p.descricao || 'Sem descrição cadastrada para este produto.')}</div>
          <div class="tab-panel" id="tab-especificacoes">
            ${especificacoes.length ? `
              <table class="specs-table">
                ${especificacoes.map(([chave, valor]) => `<tr><td>${escapeHtml(chave)}</td><td>${escapeHtml(valor)}</td></tr>`).join('')}
              </table>
            ` : '<p style="color:var(--text-muted); font-size:13px;">Nenhuma especificação técnica cadastrada.</p>'}
          </div>
        </div>
      </div>
    </div>
  `;
}

function parseCaracteristicas(texto) {
  if (!texto) return [];
  return texto.split('\n')
    .map((linha) => linha.split(':'))
    .filter((partes) => partes.length >= 2)
    .map(([chave, ...resto]) => [chave.trim(), resto.join(':').trim()])
    .filter(([chave, valor]) => chave && valor);
}

function mostrarTab(nome, botao) {
  document.querySelectorAll('.tab-buttons button').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
  botao.classList.add('active');
  document.getElementById(`tab-${nome}`).classList.add('active');
}

function selecionarVariacao(variacaoId) {
  const opcao = VARIACOES_ATUAL.find((v) => v.id === variacaoId);
  if (!opcao) return;
  VARIACAO_SELECIONADA = opcao;

  document.querySelectorAll('.opcao-variacao').forEach((el) => {
    el.classList.toggle('selecionada', Number(el.dataset.id) === variacaoId);
  });

  const precoComVariacao = precoFinal(PRODUTO_ATUAL) + (opcao.precoAdicional || 0);
  document.getElementById('produto-preco-exibido').textContent = formatCurrency(precoComVariacao);
}

function adicionarProdutoAoCarrinho() {
  if (VARIACOES_ATUAL.length && !VARIACAO_SELECIONADA) {
    alert('Escolha uma opção antes de adicionar ao carrinho.');
    return;
  }
  addToCart(PRODUTO_ATUAL.id, VARIACAO_SELECIONADA ? {
    variacaoId: VARIACAO_SELECIONADA.id,
    variacaoNome: VARIACAO_SELECIONADA.nome,
    precoAdicional: VARIACAO_SELECIONADA.precoAdicional
  } : {});
}

// ---------------------------------------------------------------------------
// Calcular frete — mostra as opções de entrega cadastradas no painel (custo
// e prazo). Cálculo por distância real via CEP fica para quando a Fase 8.1
// integrar uma transportadora/Correios de verdade.
// ---------------------------------------------------------------------------
async function calcularFrete() {
  const resultado = document.getElementById('frete-resultado');
  const cepInformado = document.getElementById('frete-cep').value.replace(/\D/g, '');
  resultado.innerHTML = '<p style="font-size:12px; color:var(--text-muted);">Calculando...</p>';

  // Se o cliente informou um CEP válido (8 dígitos), tenta a cotação real
  // primeiro. Sem CEP, ou se a cotação real não estiver disponível, cai
  // para as opções de entrega cadastradas manualmente (sempre funciona).
  if (cepInformado.length === 8) {
    try {
      const resposta = await fetch(`${API_BASE}/frete/cotar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produtoId: PRODUTO_ATUAL.id, cepDestino: cepInformado, quantidade: 1 })
      });
      const dados = await resposta.json();

      if (dados.ok && dados.cotacoes && dados.cotacoes.length > 0) {
        resultado.innerHTML = dados.cotacoes.map((c) => `
          <div class="frete-opcao">
            <span>${escapeHtml(c.nome)}${c.transportadora ? ' — ' + escapeHtml(c.transportadora) : ''} (até ${c.prazoDias} dia${c.prazoDias === 1 ? '' : 's'})</span>
            <strong>${formatCurrency(c.preco)}</strong>
          </div>
        `).join('');
        return;
      }
    } catch (err) {
      console.error('Erro ao cotar frete real, usando opções cadastradas', err);
    }
  }

  try {
    const entregas = await fetch(`${API_BASE}/entregas`).then((r) => r.json());
    const ativas = entregas.filter((e) => e.status !== 'inativo');
    resultado.innerHTML = ativas.length
      ? ativas.map((e) => `<div class="frete-opcao"><span>${escapeHtml(e.nome)} (${escapeHtml(e.prazo || '-')})</span><strong>${e.custo > 0 ? formatCurrency(e.custo) : 'Grátis'}</strong></div>`).join('')
      : '<p style="font-size:12px; color:var(--text-muted);">Nenhuma opção de entrega cadastrada.</p>';
  } catch (err) {
    console.error(err);
    resultado.innerHTML = '<p style="font-size:12px; color:var(--danger-color);">Não foi possível calcular o frete agora.</p>';
  }
}

// ---------------------------------------------------------------------------
// Relacionados (mesma subcategoria) e Semelhantes (mesma categoria mãe)
// ---------------------------------------------------------------------------
async function carregarRelacionadosSemelhantes(produtoAtual, categorias) {
  try {
    const todosProdutos = await fetch(`${API_BASE}/produtos`).then((r) => r.json());
    const outros = todosProdutos.filter((p) => p.id !== produtoAtual.id && p.status !== 'inativo');

    const relacionados = outros.filter((p) => String(p.categoriaId) === String(produtoAtual.categoriaId));

    const categoriaAtual = categorias.find((c) => String(c.id) === String(produtoAtual.categoriaId));
    const irmasMesmaMae = categoriaAtual && categoriaAtual.paiId
      ? categorias.filter((c) => String(c.paiId) === String(categoriaAtual.paiId)).map((c) => c.id)
      : [];
    const semelhantes = outros.filter((p) =>
      irmasMesmaMae.includes(Number(p.categoriaId)) && String(p.categoriaId) !== String(produtoAtual.categoriaId)
    );

    if (relacionados.length) {
      document.getElementById('titulo-relacionados').style.display = 'flex';
      document.getElementById('grid-relacionados').innerHTML = relacionados.slice(0, 4).map(montarCardProduto).join('');
    }
    if (semelhantes.length) {
      document.getElementById('titulo-semelhantes').style.display = 'flex';
      document.getElementById('grid-semelhantes').innerHTML = semelhantes.slice(0, 4).map(montarCardProduto).join('');
    }
  } catch (err) {
    console.error('Erro ao carregar relacionados/semelhantes', err);
  }
}
