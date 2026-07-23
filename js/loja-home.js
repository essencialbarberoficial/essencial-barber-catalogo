// ============================================================================
// Essencial Barber - Home (js/loja-home.js)
// ============================================================================
function initHomeLoja() { /* marcador: avisa o app.js que esta página cuida dos próprios produtos */ }

document.addEventListener('DOMContentLoaded', () => {
  initHomeLoja();
  initCarrossel();
  aplicarOrdemSecoesHome();
  carregarSecoesProdutos();
});

// ---------------------------------------------------------------------------
// Ordem das seções — reflete o que foi configurado em Configurações do
// Catálogo → Layout da Home. Se não houver configuração (loja nova), usa a
// ordem padrão em que os blocos já estão no HTML.
// ---------------------------------------------------------------------------
async function aplicarOrdemSecoesHome() {
  try {
    const config = await fetch(`${API_BASE}/config`).then((r) => r.json());
    if (!config.catalogoOrdemSecoes) return;

    const ordem = JSON.parse(config.catalogoOrdemSecoes);
    const padrao = ['destaque', 'ofertas', 'lancamentos'];
    if (!Array.isArray(ordem) || ordem.length !== 3 || !padrao.every((s) => ordem.includes(s))) return;

    // Reinsere cada bloco no DOM na ordem configurada. Usa insertBefore com
    // uma referência fixa (o que vem logo depois do último bloco, ex: a
    // faixa de Benefícios) — assim as seções reordenadas continuam no lugar
    // certo, sem "cair" pro fim da página.
    const ultimoBloco = document.getElementById(`bloco-secao-${padrao[padrao.length - 1]}`);
    const referenciaFixa = ultimoBloco ? ultimoBloco.nextElementSibling : null;
    const container = document.getElementById(`bloco-secao-${padrao[0]}`).parentElement;

    ordem.forEach((slug) => {
      const bloco = document.getElementById(`bloco-secao-${slug}`);
      if (bloco) container.insertBefore(bloco, referenciaFixa);
    });
  } catch (err) {
    console.error('Erro ao aplicar ordem das seções da Home', err);
  }
}

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
// Destaques / Ofertas / Lançamentos — tudo a partir dos produtos reais
// ---------------------------------------------------------------------------
async function carregarSecoesProdutos() {
  try {
    const produtos = await fetch(`${API_BASE}/produtos`).then((r) => r.json());
    const ativos = produtos.filter((p) => p.status !== 'inativo');

    // Usa os produtos marcados como "Destaque" no painel. Se ainda nenhum
    // foi marcado (loja recém-configurada), cai de volta pros primeiros
    // produtos cadastrados, pra seção nunca ficar vazia sem necessidade.
    const destacados = ativos.filter((p) => p.destaque);
    renderGrid('grid-destaques', destacados.length ? destacados.slice(0, 8) : ativos.slice(0, 8));

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
