// =============================================================================
// api/produto-preview.js
// -----------------------------------------------------------------------------
// Roda no Vercel (função serverless) — não no navegador. Serve
// /produto.html no lugar do arquivo estático (veja vercel.json), buscando
// os dados reais do produto no backend e escrevendo as tags de prévia
// (Open Graph) direto no HTML entregue.
//
// Por quê: robôs de rede social (Instagram, WhatsApp, Facebook) não
// executam JavaScript — eles só leem o HTML que o servidor manda na
// primeira resposta. Sem isso, a página real (produto-app.html) carrega
// o nome/foto/preço via JavaScript DEPOIS que a página já abriu, e o
// robô nunca vê nada específico daquele produto.
//
// A pessoa de verdade nunca percebe diferença nenhuma — depois das tags
// de prévia, entregamos exatamente a mesma página de sempre
// (produto-app.html), com o mesmo JavaScript, funcionando igual.
// =============================================================================

const API_BASE = 'https://essencial-barber-backend-production.up.railway.app/api';

function escaparHtml(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = async function handler(req, res) {
  const id = req.query.id;
  const protocolo = req.headers['x-forwarded-proto'] || 'https';
  const urlAtual = `${protocolo}://${req.headers.host}${req.url}`;

  // Busca o template da página real — o mesmo arquivo que já existia,
  // só renomeado. Buscando por HTTP (não pelo sistema de arquivos),
  // funciona de forma confiável independente de como o Vercel organiza
  // os arquivos na hora do build.
  let html;
  try {
    const templateResposta = await fetch(`${protocolo}://${req.headers.host}/produto-app.html`);
    html = await templateResposta.text();
  } catch (err) {
    console.error('Erro ao buscar o template da página de produto', err);
    res.status(500).send('Erro ao carregar a página.');
    return;
  }

  // Busca os dados reais do produto — se falhar por qualquer motivo, a
  // página ainda é entregue normalmente (só sem as tags de prévia
  // customizadas), nunca quebra a experiência de quem clicou.
  let produto = null;
  if (id) {
    try {
      const respostaProduto = await fetch(`${API_BASE}/produtos/${id}`);
      if (respostaProduto.ok) produto = await respostaProduto.json();
    } catch (err) {
      console.error('Erro ao buscar produto pra prévia', err);
    }
  }

  if (produto) {
    const titulo = `${produto.nome} | Essencial Barber`;
    const descricaoCrua = (produto.descricao || 'Confira esse produto na Essencial Barber — produtos selecionados pra sua barbearia.').replace(/<[^>]*>/g, '');
    const descricao = descricaoCrua.length > 200 ? `${descricaoCrua.slice(0, 197)}...` : descricaoCrua;
    const imagem = produto.imagem || `${protocolo}://${req.headers.host}/img/og-padrao.png`;
    const preco = produto.precoPromocional > 0 ? produto.precoPromocional : produto.preco;

    const tagsPrevia = `
    <title id="page-title">${escaparHtml(titulo)}</title>
    <meta property="og:type" content="product">
    <meta property="og:title" content="${escaparHtml(titulo)}">
    <meta property="og:description" content="${escaparHtml(descricao)}">
    <meta property="og:image" content="${escaparHtml(imagem)}">
    <meta property="og:url" content="${escaparHtml(urlAtual)}">
    <meta property="product:price:amount" content="${preco}">
    <meta property="product:price:currency" content="BRL">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escaparHtml(titulo)}">
    <meta name="twitter:description" content="${escaparHtml(descricao)}">
    <meta name="twitter:image" content="${escaparHtml(imagem)}">`;

    html = html.replace('<title id="page-title">Produto | Essencial Barber</title>', tagsPrevia);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Cache curto no CDN do Vercel — a prévia fica rápida pra robôs que
  // buscam o mesmo link várias vezes, mas nunca por muito tempo (produto
  // pode mudar de preço/imagem no painel a qualquer momento).
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.status(200).send(html);
};
