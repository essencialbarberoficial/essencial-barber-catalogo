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
// Carrossel do banner principal — se houver banners configurados em
// Configurações do Catálogo → Geral, troca os slides de texto padrão
// pelas imagens configuradas (desktop/mobile, via <picture>). Sem nenhum
// banner configurado ainda, mantém o texto padrão que já vinha no HTML.
// ---------------------------------------------------------------------------
async function initCarrossel() {
  await aplicarBannersConfigurados();
  montarRotacaoCarrossel();
}

async function aplicarBannersConfigurados() {
  try {
    const config = await fetch(`${API_BASE}/config`).then((r) => r.json());
    if (!config.catalogoBanners) return; // sem nada configurado — seção continua escondida

    const banners = JSON.parse(config.catalogoBanners);
    if (!Array.isArray(banners) || banners.length === 0) return; // idem

    const heroBanner = document.getElementById('hero-banner');
    if (!heroBanner) return;

    heroBanner.innerHTML = banners.map((banner, i) => `
      <div class="hero-slide-imagem ${i === 0 ? 'active' : ''} ${banner.link ? 'tem-link' : ''}" ${banner.link ? `data-link="${escapeHtml(banner.link)}"` : ''}>
        <picture>
          ${banner.mobileBase64 ? `<source media="(max-width: 767px)" srcset="${banner.mobileBase64}">` : ''}
          <img src="${banner.desktopBase64 || banner.mobileBase64}" alt="Banner promocional">
        </picture>
      </div>
    `).join('') + '<div class="hero-dots" id="hero-dots"></div>';

    heroBanner.querySelectorAll('.hero-slide-imagem[data-link]').forEach((el) => {
      el.addEventListener('click', () => { window.location.href = el.dataset.link; });
    });

    // Só agora que tem conteúdo de verdade, a seção aparece — antes disso
    // fica escondida (display:none já vem assim no HTML), sem deixar
    // espaço vazio nem texto de reserva.
    heroBanner.style.display = '';
  } catch (err) {
    console.error('Erro ao carregar banners configurados — seção do banner fica escondida', err);
  }
}

function montarRotacaoCarrossel() {
  const slides = document.querySelectorAll('.hero-slide, .hero-slide-imagem');
  const dotsContainer = document.getElementById('hero-dots');
  if (slides.length === 0 || !dotsContainer) return;

  dotsContainer.innerHTML = Array.from(slides).map((_, i) => `<span data-i="${i}" class="${i === 0 ? 'active' : ''}"></span>`).join('');
  const dots = dotsContainer.querySelectorAll('span');

  let atual = 0;
  function mostrar(i) {
    slides.forEach((s, idx) => s.classList.toggle('active', idx === i));
    dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
    atual = i;
  }
  dots.forEach((d) => d.addEventListener('click', () => mostrar(Number(d.dataset.i))));

  if (slides.length > 1) setInterval(() => mostrar((atual + 1) % slides.length), 6000);
}


// ---------------------------------------------------------------------------
// Destaques / Ofertas / Lançamentos — tudo a partir dos produtos reais
// ---------------------------------------------------------------------------
async function carregarSecoesProdutos() {
  try {
    // Fase 23 — cada seção agora vem pronta da Vitrine do Catálogo: a
    // curadoria manual feita no painel primeiro, completada pela regra
    // automática (preço promocional pra Ofertas, mais recentes pra
    // Lançamentos) se sobrar espaço — tudo já resolvido no servidor.
    const [destaque, ofertas, lancamentos] = await Promise.all([
      fetch(`${API_BASE}/vitrines/destaque/publica?limite=8`).then((r) => r.json()),
      fetch(`${API_BASE}/vitrines/ofertas/publica?limite=8`).then((r) => r.json()),
      fetch(`${API_BASE}/vitrines/lancamentos/publica?limite=8`).then((r) => r.json())
    ]);

    renderGrid('grid-destaques', destaque.produtos);
    renderGrid('grid-ofertas', ofertas.produtos, 'Nenhuma oferta no momento.');
    renderGrid('grid-lancamentos', lancamentos.produtos);
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
