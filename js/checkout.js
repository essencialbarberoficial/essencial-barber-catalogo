// ============================================================================
// Essencial Barber - Checkout (Fase 8 Parte 2B)
// ============================================================================
let PEDIDO_ATUAL = null;
let CHECKOUT_CONFIG = null;
let INTERVALO_POLLING_PIX = null;
let MP_INSTANCE = null;

document.addEventListener('DOMContentLoaded', async () => {
  const pedidoId = getQueryParam('pedido');
  const container = document.getElementById('checkout-conteudo');

  if (!pedidoId) {
    container.innerHTML = '<div class="empty-msg">Pedido não informado.</div>';
    return;
  }

  try {
    [PEDIDO_ATUAL, CHECKOUT_CONFIG] = await Promise.all([
      fetch(`${API_BASE}/pedidos/${pedidoId}/publico`).then((r) => { if (!r.ok) throw new Error('não encontrado'); return r.json(); }),
      fetch(`${API_BASE}/checkout/config`).then((r) => r.json())
    ]);

    if (PEDIDO_ATUAL.pago) {
      window.location.href = `confirmacao.html?pedido=${pedidoId}`;
      return;
    }

    renderizarCheckout();
  } catch (err) {
    console.error('Erro ao carregar checkout', err);
    container.innerHTML = '<div class="empty-msg">Não foi possível carregar seu pedido.</div>';
  }
});

function renderizarCheckout() {
  const container = document.getElementById('checkout-conteudo');
  const formasDisponiveis = (CHECKOUT_CONFIG.formasPagamento || []).filter((f) => f.status !== 'inativo');
  const temPix = CHECKOUT_CONFIG.integradoComMercadoPago && formasDisponiveis.some((f) => f.tipo === 'pix');
  const temCartao = CHECKOUT_CONFIG.integradoComMercadoPago && formasDisponiveis.some((f) => f.tipo === 'credito');
  const formaCartao = formasDisponiveis.find((f) => f.tipo === 'credito');

  container.innerHTML = `
    <div class="section-title" style="margin-top:20px;"><h2>Resumo do Pedido #${PEDIDO_ATUAL.id}</h2></div>
    <div class="card-panel" style="margin-bottom:20px;">
      ${PEDIDO_ATUAL.itens.map((i) => `
        <div style="display:flex; justify-content:space-between; padding:6px 0; font-size:14px;">
          <span>${i.quantidade}x ${escapeHtml(i.nomeProduto)}</span>
          <span>${formatCurrency(i.quantidade * i.precoUnitario)}</span>
        </div>
      `).join('')}
      <div style="display:flex; justify-content:space-between; padding-top:12px; margin-top:8px; border-top:1px solid var(--border-color); font-weight:700; font-size:16px;">
        <span>Total</span><span style="color:var(--primary);">${formatCurrency(PEDIDO_ATUAL.total)}</span>
      </div>
    </div>

    ${!CHECKOUT_CONFIG.integradoComMercadoPago ? `
      <div class="card-panel" style="text-align:center;">
        <p style="margin-bottom:14px;">Pagamento online temporariamente indisponível. Finalize seu pedido pelo WhatsApp:</p>
        <button class="btn" onclick="finalizarPorWhatsApp()"><i class="fa-brands fa-whatsapp"></i> Falar no WhatsApp</button>
      </div>
    ` : `
      <div class="section-title"><h2>Forma de Pagamento</h2></div>
      <div style="display:flex; gap:12px; margin-bottom:20px;">
        ${temPix ? `<div class="opcao-variacao" id="opcao-pix" onclick="selecionarFormaPagamento('pix')" style="flex:1; text-align:center; padding:16px;"><i class="fa-solid fa-qrcode" style="font-size:22px; display:block; margin-bottom:6px;"></i> Pix</div>` : ''}
        ${temCartao ? `<div class="opcao-variacao" id="opcao-cartao" onclick="selecionarFormaPagamento('cartao')" style="flex:1; text-align:center; padding:16px;">
          <i class="fa-solid fa-credit-card" style="font-size:22px; display:block; margin-bottom:6px;"></i> Cartão de Crédito
          ${formaCartao && formaCartao.parcelasSemJuros > 1 ? `<div style="font-size:11px; color:var(--text-muted); margin-top:4px;">em até ${formaCartao.parcelasSemJuros}x sem juros</div>` : ''}
        </div>` : ''}
      </div>

      <div id="painel-pix" style="display:none;"></div>
      <div id="painel-cartao" style="display:none;">
        <div id="card-payment-brick-container"></div>
      </div>
    `}
  `;
}

function finalizarPorWhatsApp() {
  const itens = PEDIDO_ATUAL.itens.map((i) => `${i.quantidade}x ${i.nomeProduto}`).join(', ');
  const mensagem = encodeURIComponent(`Olá! Gostaria de finalizar o pedido #${PEDIDO_ATUAL.id}.\n\n${itens}\n\nTotal: ${formatCurrency(PEDIDO_ATUAL.total)}`);
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${mensagem}`, '_blank');
}

function selecionarFormaPagamento(forma) {
  document.querySelectorAll('.opcao-variacao').forEach((el) => el.classList.remove('selecionada'));
  document.getElementById(`opcao-${forma}`).classList.add('selecionada');

  document.getElementById('painel-pix').style.display = forma === 'pix' ? 'block' : 'none';
  document.getElementById('painel-cartao').style.display = forma === 'cartao' ? 'block' : 'none';

  if (forma === 'pix') iniciarPagamentoPix();
  if (forma === 'cartao') iniciarPagamentoCartao();
}

// ---------------------------------------------------------------------------
// PIX — gera o QR Code e fica verificando automaticamente se já foi pago
// ---------------------------------------------------------------------------
async function iniciarPagamentoPix() {
  const painel = document.getElementById('painel-pix');
  painel.innerHTML = '<div class="empty-msg">Gerando seu Pix...</div>';

  try {
    const resposta = await fetch(`${API_BASE}/checkout/pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedidoId: PEDIDO_ATUAL.id })
    });
    const dados = await resposta.json();

    if (!resposta.ok) {
      painel.innerHTML = `<div class="empty-msg">${escapeHtml(dados.error || 'Não foi possível gerar o Pix.')}</div>`;
      return;
    }

    painel.innerHTML = `
      <div class="card-panel" style="text-align:center;">
        <img src="data:image/png;base64,${dados.qrCodeBase64}" alt="QR Code Pix" style="width:220px; height:220px; margin:0 auto 16px;">
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:10px;">Escaneie o QR Code com o app do seu banco, ou copie o código abaixo:</p>
        <div style="display:flex; gap:8px; margin-bottom:14px;">
          <input type="text" readonly value="${dados.qrCodeTexto}" id="pix-copia-cola" class="form-control" style="font-size:11px;">
          <button class="btn-secondary btn" onclick="copiarCodigoPix()">Copiar</button>
        </div>
        <p style="font-size:13px; color:var(--danger-color, #dc2626);">⏱️ Expira em <span id="pix-contador"></span></p>
        <p style="font-size:12px; color:var(--text-muted); margin-top:10px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Aguardando confirmação do pagamento...</p>
      </div>
    `;

    iniciarContadorPix(dados.expiraEm);
    iniciarPollingStatusPedido();
  } catch (err) {
    console.error('Erro ao gerar Pix', err);
    painel.innerHTML = '<div class="empty-msg">Erro ao gerar o Pix. Tente novamente.</div>';
  }
}

function copiarCodigoPix() {
  const campo = document.getElementById('pix-copia-cola');
  campo.select();
  navigator.clipboard.writeText(campo.value).catch(() => document.execCommand('copy'));
  alert('Código Pix copiado!');
}

function iniciarContadorPix(expiraEmISO) {
  const elemento = document.getElementById('pix-contador');
  function atualizar() {
    const restante = new Date(expiraEmISO) - new Date();
    if (restante <= 0) {
      elemento.textContent = 'expirado';
      clearInterval(intervalo);
      return;
    }
    const minutos = Math.floor(restante / 60000);
    const segundos = Math.floor((restante % 60000) / 1000);
    elemento.textContent = `${minutos}m ${segundos.toString().padStart(2, '0')}s`;
  }
  atualizar();
  const intervalo = setInterval(atualizar, 1000);
}

function iniciarPollingStatusPedido() {
  if (INTERVALO_POLLING_PIX) clearInterval(INTERVALO_POLLING_PIX);
  INTERVALO_POLLING_PIX = setInterval(async () => {
    try {
      const status = await fetch(`${API_BASE}/checkout/status/${PEDIDO_ATUAL.id}`).then((r) => r.json());
      if (status.pago) {
        clearInterval(INTERVALO_POLLING_PIX);
        window.location.href = `confirmacao.html?pedido=${PEDIDO_ATUAL.id}`;
      }
    } catch (err) {
      console.error('Erro ao verificar status do pagamento', err);
    }
  }, 3000);
}

// ---------------------------------------------------------------------------
// CARTÃO — formulário seguro do próprio Mercado Pago (Card Payment Brick).
// Os dados do cartão nunca passam pelo nosso servidor.
// ---------------------------------------------------------------------------
async function iniciarPagamentoCartao() {
  const container = document.getElementById('card-payment-brick-container');
  container.innerHTML = '';

  if (!CHECKOUT_CONFIG.publicKey) {
    container.innerHTML = '<div class="empty-msg">Pagamento por cartão indisponível no momento.</div>';
    return;
  }

  if (!MP_INSTANCE) {
    MP_INSTANCE = new MercadoPago(CHECKOUT_CONFIG.publicKey, { locale: 'pt-BR' });
  }

  const bricksBuilder = MP_INSTANCE.bricks();

  await bricksBuilder.create('cardPayment', 'card-payment-brick-container', {
    initialization: { amount: PEDIDO_ATUAL.total },
    callbacks: {
      onReady: () => {},
      onSubmit: (cardFormData) => new Promise(async (resolve, reject) => {
        try {
          const resposta = await fetch(`${API_BASE}/checkout/cartao`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pedidoId: PEDIDO_ATUAL.id,
              token: cardFormData.token,
              installments: cardFormData.installments,
              paymentMethodId: cardFormData.payment_method_id,
              issuerId: cardFormData.issuer_id,
              payer: cardFormData.payer
            })
          });
          const dados = await resposta.json();

          if (!resposta.ok || dados.status === 'rejected') {
            alert(CHECKOUT_CONFIG.mensagens.checkout_corpo_pagamento_recusado || 'Pagamento recusado. Tente outro cartão.');
            reject();
            return;
          }

          resolve();
          window.location.href = `confirmacao.html?pedido=${PEDIDO_ATUAL.id}`;
        } catch (err) {
          console.error('Erro ao processar cartão', err);
          reject();
        }
      }),
      onError: (error) => console.error('Erro no formulário de cartão:', error)
    }
  });
}
