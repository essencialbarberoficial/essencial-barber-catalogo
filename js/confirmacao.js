// ============================================================================
// Essencial Barber - Confirmação do Pedido (Fase 8 Parte 2B)
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  const pedidoId = getQueryParam('pedido');
  const container = document.getElementById('confirmacao-conteudo');

  if (!pedidoId) {
    container.innerHTML = '<div class="empty-msg">Pedido não informado.</div>';
    return;
  }

  try {
    const [pedido, status, config] = await Promise.all([
      fetch(`${API_BASE}/pedidos/${pedidoId}/publico`).then((r) => r.json()),
      fetch(`${API_BASE}/checkout/status/${pedidoId}`).then((r) => r.json()),
      fetch(`${API_BASE}/checkout/config`).then((r) => r.json())
    ]);

    renderizarConfirmacao(pedido, status, config.mensagens || {});
  } catch (err) {
    console.error('Erro ao carregar confirmação', err);
    container.innerHTML = '<div class="empty-msg">Não foi possível carregar seu pedido.</div>';
  }
});

function renderizarConfirmacao(pedido, status, msg) {
  const container = document.getElementById('confirmacao-conteudo');

  let titulo, corpo, icone, cor;

  if (status.pago) {
    icone = '✅'; cor = 'var(--success-color, #16a34a)';
    if (status.tipoPagamento === 'cartao') {
      titulo = msg.checkout_titulo_cartao_aprovado || 'Pedido confirmado!';
      corpo = msg.checkout_corpo_cartao_aprovado || 'Seu pagamento foi aprovado com sucesso.';
    } else {
      titulo = msg.checkout_titulo_pix_aprovado || 'Pedido confirmado!';
      corpo = msg.checkout_corpo_pix_aprovado || 'Recebemos seu pagamento com sucesso.';
    }
  } else if (status.statusPagamento === 'in_process' || status.statusPagamento === 'pending') {
    icone = '⏳'; cor = 'var(--text-muted)';
    titulo = msg.checkout_titulo_cartao_analise || 'Pagamento em processamento';
    corpo = msg.checkout_corpo_cartao_analise || 'Você será avisado assim que for aprovado.';
  } else {
    icone = '❌'; cor = 'var(--danger-color, #dc2626)';
    titulo = msg.checkout_titulo_pagamento_recusado || 'Não foi possível confirmar o pagamento';
    corpo = msg.checkout_corpo_pagamento_recusado || 'Tente novamente ou escolha outra forma de pagamento.';
  }

  const rodape = (msg.checkout_rodape || 'Você vai receber atualizações sobre o preparo e envio do seu pedido por aqui.')
    .replace('{numeroPedido}', pedido.id);

  container.innerHTML = `
    <div style="font-size:56px; margin-bottom:16px;">${icone}</div>
    <h1 style="font-size:22px; margin-bottom:10px; color:${cor};">${escapeHtml(titulo)}</h1>
    <p style="color:var(--text-muted); margin-bottom:6px;">${escapeHtml(corpo)}</p>
    <p style="font-size:13px; color:var(--text-muted); margin-bottom:20px;">Pedido #${pedido.id}</p>
    <p style="font-size:13px; color:var(--text-muted); margin-bottom:26px;">${escapeHtml(rodape)}</p>

    <div style="display:flex; flex-direction:column; gap:10px;">
      <a href="pedido.html?id=${pedido.id}" class="btn">${escapeHtml(msg.checkout_texto_botao_acompanhar || 'Acompanhar meu Pedido')}</a>
      <button class="btn-secondary btn" onclick="falarNoWhatsApp(${pedido.id})">
        <i class="fa-brands fa-whatsapp"></i> ${escapeHtml(msg.checkout_texto_botao_whatsapp || 'Falar no WhatsApp')}
      </button>
      <a href="index.html" style="font-size:13px; color:var(--text-muted); margin-top:8px;">Continuar Comprando</a>
    </div>
  `;

  // Se ainda estiver em análise, continua verificando em segundo plano e
  // atualiza a tela sozinha assim que houver uma resposta definitiva.
  if (!status.pago && (status.statusPagamento === 'in_process' || status.statusPagamento === 'pending')) {
    setTimeout(() => window.location.reload(), 8000);
  }
}

function falarNoWhatsApp(pedidoId) {
  const mensagem = encodeURIComponent(`Olá! Gostaria de saber mais sobre o meu pedido #${pedidoId}.`);
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${mensagem}`, '_blank');
}
