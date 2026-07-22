// ============================================================================
// Essencial Barber - Páginas Institucionais Editáveis (Fase 19 / Parte 6)
// ============================================================================
// Cada página institucional (Sobre, Contato, FAQ, etc.) busca seu próprio
// conteúdo do painel, em vez de ter o texto fixo no HTML. O slug da página
// vem do atributo data-pagina-slug do elemento <main>.
document.addEventListener('DOMContentLoaded', async () => {
  const main = document.querySelector('main[data-pagina-slug]');
  if (!main) return;

  const slug = main.dataset.paginaSlug;
  const tituloEl = document.getElementById('pagina-titulo');
  const conteudoEl = document.getElementById('pagina-conteudo');

  try {
    const resposta = await fetch(`${API_BASE}/paginas/${slug}`);
    if (!resposta.ok) throw new Error('Página não encontrada');
    const pagina = await resposta.json();

    if (tituloEl) tituloEl.textContent = pagina.titulo;
    document.title = `${pagina.titulo} | Essencial Barber`;
    if (conteudoEl) conteudoEl.innerHTML = pagina.conteudoHtml || '';
  } catch (err) {
    console.error('Erro ao carregar conteúdo da página institucional', err);
    if (conteudoEl) conteudoEl.innerHTML = '<p>Não foi possível carregar esta página no momento.</p>';
  }
});
