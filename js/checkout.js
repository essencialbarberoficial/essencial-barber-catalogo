// ============================================================================
// Essencial Barber - Checkout (Fase 8 Parte 2B + Fase 15 Parte 3)
// ============================================================================
let PEDIDO_ATUAL = null;
let CHECKOUT_CONFIG = null;
let ENTREGAS_DISPONIVEIS = null;
let COTACOES_FRETE = [];
let ENTREGA_ESCOLHIDA = null; // { tipoRecebimento, entregaId, valorFrete, nome }
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
    [PEDIDO_ATUAL, CHECKOUT_CONFIG, ENTREGAS_DISPONIVEIS] = await Promise.all([
      fetch(`${API_BASE}/pedidos/${pedidoId}/publico`).then((r) => { if (!r.ok) throw new Error('não encontrado'); return r.json(); }),
      fetch(`${API_BASE}/checkout/config`).then((r) => r.json()),
      fetch(`${API_BASE}/entregas/disponiveis`).then((r) => r.json())
    ]);

    if (PEDIDO_ATUAL.pago) {
      window.location.href = `confirmacao.html?pedido=${pedidoId}`;
      return;
    }

    renderizarEtapaEntrega();
  } catch (err) {
    console.error('Erro ao carregar checkout', err);
    container.innerHTML = '<div class="empty-msg">Não foi possível carregar seu pedido.</div>';
  }
});

// ---------------------------------------------------------------------------
// ETAPA — Entrega: CEP automático, Entrega x Retirada na Loja, frete real
// ---------------------------------------------------------------------------
function renderizarEtapaEntrega() {
  const container = document.getElementById('checkout-conteudo');
  const usuario = CURRENT_USER || {};
  const temRetirada = ENTREGAS_DISPONIVEIS.retirada && ENTREGAS_DISPONIVEIS.retirada.length > 0;
  // Se o cliente já preencheu isso antes (ex: voltou pra editar a partir da
  // Revisão), reaproveita o que já foi salvo em vez de mostrar em branco.
  const enderecoSalvo = PEDIDO_ATUAL.enderecoEntrega || {};
  const tipoJaEscolhido = PEDIDO_ATUAL.tipoRecebimento === 'retirada' ? 'retirada' : 'entrega';

  container.innerHTML = `
    <div class="section-title" style="margin-top:20px;"><h2>Entrega — Pedido #${PEDIDO_ATUAL.id}</h2></div>

    <div class="card-panel" style="margin-bottom:18px;">
      <div style="display:flex; gap:12px; margin-bottom:16px;">
        <div class="opcao-variacao" id="opcao-tipo-entrega" onclick="selecionarTipoRecebimento('entrega')" style="flex:1; text-align:center; padding:14px;">
          <i class="fa-solid fa-truck"></i> Entrega
        </div>
        ${temRetirada ? `
          <div class="opcao-variacao" id="opcao-tipo-retirada" onclick="selecionarTipoRecebimento('retirada')" style="flex:1; text-align:center; padding:14px;">
            <i class="fa-solid fa-store"></i> Retirada na Loja
          </div>
        ` : ''}
      </div>

      <div id="bloco-entrega">
        <div style="display:flex; gap:8px; margin-bottom:10px;">
          <input type="text" id="ent-cep" class="form-control" placeholder="CEP" value="${escapeHtml(enderecoSalvo.cep || usuario.cep || '')}" style="max-width:160px;">
          <button class="btn-secondary btn" onclick="buscarCep()">Buscar CEP</button>
        </div>
        <div class="form-group"><label>Rua</label><input type="text" id="ent-rua" class="form-control" value="${escapeHtml(enderecoSalvo.rua || '')}"></div>
        <div style="display:flex; gap:10px;">
          <div class="form-group" style="flex:1;"><label>Número</label><input type="text" id="ent-numero" class="form-control" value="${escapeHtml(enderecoSalvo.numero || '')}"></div>
          <div class="form-group" style="flex:2;"><label>Complemento</label><input type="text" id="ent-complemento" class="form-control" value="${escapeHtml(enderecoSalvo.complemento || '')}"></div>
        </div>
        <div class="form-group"><label>Bairro</label><input type="text" id="ent-bairro" class="form-control" value="${escapeHtml(enderecoSalvo.bairro || usuario.bairro || '')}"></div>
        <div style="display:flex; gap:10px;">
          <div class="form-group" style="flex:2;"><label>Cidade</label><input type="text" id="ent-cidade" class="form-control" value="${escapeHtml(enderecoSalvo.cidade || '')}"></div>
          <div class="form-group" style="flex:1;"><label>Estado</label><input type="text" id="ent-estado" class="form-control" maxlength="2" value="${escapeHtml(enderecoSalvo.estado || '')}"></div>
        </div>

        <button class="btn-secondary btn" style="width:100%; margin:10px 0;" onclick="calcularFreteCheckout()">Calcular Opções de Frete</button>
        <div id="opcoes-frete-checkout"></div>
      </div>

      <div id="bloco-retirada" style="display:none;"></div>
    </div>

    <div id="erro-entrega" style="color:var(--danger-color, #dc2626); font-size:13px; margin-bottom:10px;"></div>
    <button class="btn" style="width:100%;" onclick="confirmarEtapaEntrega()">Continuar</button>
  `;

  selecionarTipoRecebimento(tipoJaEscolhido);
  // Se já tinha frete calculado e escolhido antes, recalcula pra mostrar as opções de novo
  if (tipoJaEscolhido === 'entrega' && enderecoSalvo.cep) {
    calcularFreteCheckout();
  }
}

function selecionarTipoRecebimento(tipo) {
  document.querySelectorAll('#opcao-tipo-entrega, #opcao-tipo-retirada').forEach((el) => el && el.classList.remove('selecionada'));
  const elEscolhido = document.getElementById(tipo === 'entrega' ? 'opcao-tipo-entrega' : 'opcao-tipo-retirada');
  if (elEscolhido) elEscolhido.classList.add('selecionada');

  document.getElementById('bloco-entrega').style.display = tipo === 'entrega' ? 'block' : 'none';
  const blocoRetirada = document.getElementById('bloco-retirada');

  if (tipo === 'retirada') {
    const opcaoRetirada = ENTREGAS_DISPONIVEIS.retirada[0];
    ENTREGA_ESCOLHIDA = { tipoRecebimento: 'retirada', entregaId: opcaoRetirada.id, valorFrete: 0, nome: opcaoRetirada.nome };
    blocoRetirada.style.display = 'block';
    blocoRetirada.innerHTML = `
      <p style="font-size:14px; margin-bottom:6px;"><strong>${escapeHtml(opcaoRetirada.nome)}</strong></p>
      ${opcaoRetirada.enderecoRetirada ? `<p style="font-size:13px; color:var(--text-muted);"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(opcaoRetirada.enderecoRetirada)}</p>` : ''}
      ${opcaoRetirada.instrucoesRetirada ? `<p style="font-size:13px; color:var(--text-muted); margin-top:6px;">${escapeHtml(opcaoRetirada.instrucoesRetirada)}</p>` : ''}
      ${opcaoRetirada.prazo ? `<p style="font-size:13px; color:var(--text-muted); margin-top:6px;">Prazo: ${escapeHtml(opcaoRetirada.prazo)}</p>` : ''}
      <div class="form-group" style="margin-top:12px;">
        <label>Não é você quem vai retirar? Informe o nome do responsável</label>
        <input type="text" id="ent-nome-responsavel-retirada" class="form-control" placeholder="Deixe em branco se for você mesmo" value="${escapeHtml(PEDIDO_ATUAL.nomeResponsavelRetirada || '')}">
      </div>
    `;
  } else {
    ENTREGA_ESCOLHIDA = null;
    blocoRetirada.style.display = 'none';
  }
}

async function buscarCep() {
  const cep = document.getElementById('ent-cep').value.replace(/\D/g, '');
  if (cep.length !== 8) { alert('Digite um CEP válido (8 números).'); return; }

  try {
    const resposta = await fetch(`${API_BASE}/cep/${cep}`);
    const dados = await resposta.json();
    if (!resposta.ok) { alert(dados.error || 'CEP não encontrado.'); return; }

    document.getElementById('ent-rua').value = dados.rua || '';
    document.getElementById('ent-bairro').value = dados.bairro || '';
    document.getElementById('ent-cidade').value = dados.cidade || '';
    document.getElementById('ent-estado').value = dados.estado || '';
    document.getElementById('ent-numero').focus();
  } catch (err) {
    console.error('Erro ao buscar CEP', err);
    alert('Não foi possível buscar o CEP agora.');
  }
}

async function calcularFreteCheckout() {
  const cep = document.getElementById('ent-cep').value.replace(/\D/g, '');
  const opcoesEl = document.getElementById('opcoes-frete-checkout');
  if (cep.length !== 8) { alert('Informe o CEP primeiro.'); return; }

  opcoesEl.innerHTML = '<p style="font-size:13px; color:var(--text-muted);">Calculando frete...</p>';

  const primeiroItem = PEDIDO_ATUAL.itens[0];
  try {
    const resposta = await fetch(`${API_BASE}/frete/cotar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ produtoId: primeiroItem ? primeiroItem.produtoId : null, cepDestino: cep, quantidade: 1 })
    });
    const dados = await resposta.json();

    const opcoesCadastradas = (ENTREGAS_DISPONIVEIS.entrega || []).map((e) => ({
      id: `cad-${e.id}`, entregaId: e.id, nome: e.nome, preco: e.custo, prazoTexto: e.prazo
    }));
    const opcoesSuperfrete = (dados.ok ? dados.cotacoes : []).map((c) => ({
      id: `sf-${c.servicoId}`, entregaId: null, nome: `${c.nome}${c.transportadora ? ' — ' + c.transportadora : ''}`,
      preco: c.preco, prazoTexto: `até ${c.prazoDias} dia(s)`
    }));

    COTACOES_FRETE = [...opcoesCadastradas, ...opcoesSuperfrete];

    if (COTACOES_FRETE.length === 0) {
      opcoesEl.innerHTML = '<p style="font-size:13px; color:var(--danger-color);">Nenhuma opção de frete disponível para este CEP.</p>';
      return;
    }

    opcoesEl.innerHTML = COTACOES_FRETE.map((op, i) => `
      <label style="display:flex; justify-content:space-between; align-items:center; padding:12px; border:1px solid var(--border-color); border-radius:10px; margin-bottom:8px; cursor:pointer;">
        <span><input type="radio" name="frete-opcao" value="${i}" onchange="escolherFrete(${i})"> ${escapeHtml(op.nome)} <small style="color:var(--text-muted);">(${escapeHtml(op.prazoTexto || '')})</small></span>
        <strong>${op.preco > 0 ? formatCurrency(op.preco) : 'Grátis'}</strong>
      </label>
    `).join('');
  } catch (err) {
    console.error('Erro ao calcular frete', err);
    opcoesEl.innerHTML = '<p style="font-size:13px; color:var(--danger-color);">Erro ao calcular frete. Tente novamente.</p>';
  }
}

function escolherFrete(indice) {
  const opcao = COTACOES_FRETE[indice];
  ENTREGA_ESCOLHIDA = { tipoRecebimento: 'entrega', entregaId: opcao.entregaId, valorFrete: opcao.preco, nome: opcao.nome };
}

async function confirmarEtapaEntrega() {
  const erroEl = document.getElementById('erro-entrega');
  erroEl.textContent = '';

  if (!ENTREGA_ESCOLHIDA) {
    erroEl.textContent = 'Escolha uma opção de frete (ou Retirada na Loja) antes de continuar.';
    return;
  }

  let enderecoEntrega = null;
  if (ENTREGA_ESCOLHIDA.tipoRecebimento === 'entrega') {
    enderecoEntrega = {
      cep: document.getElementById('ent-cep').value.trim(),
      rua: document.getElementById('ent-rua').value.trim(),
      numero: document.getElementById('ent-numero').value.trim(),
      complemento: document.getElementById('ent-complemento').value.trim(),
      bairro: document.getElementById('ent-bairro').value.trim(),
      cidade: document.getElementById('ent-cidade').value.trim(),
      estado: document.getElementById('ent-estado').value.trim()
    };
    if (!enderecoEntrega.rua || !enderecoEntrega.numero || !enderecoEntrega.cidade) {
      erroEl.textContent = 'Preencha o endereço completo (rua, número e cidade).';
      return;
    }
  }

  try {
    const resposta = await fetch(`${API_BASE}/pedidos/${PEDIDO_ATUAL.id}/definir-entrega`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipoRecebimento: ENTREGA_ESCOLHIDA.tipoRecebimento,
        entregaId: ENTREGA_ESCOLHIDA.entregaId,
        valorFrete: ENTREGA_ESCOLHIDA.valorFrete,
        enderecoEntrega,
        nomeResponsavelRetirada: ENTREGA_ESCOLHIDA.tipoRecebimento === 'retirada'
          ? document.getElementById('ent-nome-responsavel-retirada').value.trim()
          : null
      })
    });
    const dados = await resposta.json();
    if (!dados.ok) { erroEl.textContent = dados.error || 'Erro ao salvar entrega.'; return; }

    // Busca o pedido atualizado por completo (já com endereço, frete e
    // desconto salvos) pra Revisão mostrar tudo certinho.
    PEDIDO_ATUAL = await fetch(`${API_BASE}/pedidos/${PEDIDO_ATUAL.id}/publico`).then((r) => r.json());
    renderizarEtapaRevisao();
  } catch (err) {
    console.error('Erro ao confirmar entrega', err);
    erroEl.textContent = 'Erro ao salvar. Tente novamente.';
  }
}

// ---------------------------------------------------------------------------
// ETAPA — Revisão: confere tudo antes de ir pro pagamento, e aceita os
// Termos de Uso / Política de Privacidade.
// ---------------------------------------------------------------------------
function renderizarEtapaRevisao() {
  const container = document.getElementById('checkout-conteudo');
  const p = PEDIDO_ATUAL;
  const endereco = p.enderecoEntrega;

  container.innerHTML = `
    <div class="section-title" style="margin-top:20px;"><h2>Revisar Pedido #${p.id}</h2></div>

    <div class="card-panel" style="margin-bottom:16px;">
      <h4 style="font-size:13px; text-transform:uppercase; margin-bottom:10px; color:var(--text-muted);">Produtos</h4>
      ${p.itens.map((i) => `
        <div style="display:flex; justify-content:space-between; padding:6px 0; font-size:14px;">
          <span>${i.quantidade}x ${escapeHtml(i.nomeProduto)}</span>
          <span>${formatCurrency(i.quantidade * i.precoUnitario)}</span>
        </div>
      `).join('')}
    </div>

    <div class="card-panel" style="margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <h4 style="font-size:13px; text-transform:uppercase; margin:0; color:var(--text-muted);">${p.tipoRecebimento === 'retirada' ? 'Retirada' : 'Endereço de Entrega'}</h4>
        <button type="button" onclick="renderizarEtapaEntrega()" style="background:none; border:none; color:var(--primary); font-size:12px; cursor:pointer; padding:0;"><i class="fa-solid fa-pen"></i> Editar</button>
      </div>
      ${p.tipoRecebimento === 'retirada'
        ? `<p style="font-size:14px;">${escapeHtml(p.entrega ? p.entrega.nome : 'Retirada na Loja')}</p>
           ${p.nomeResponsavelRetirada ? `<p style="font-size:13px; color:var(--text-muted); margin-top:4px;"><i class="fa-solid fa-user"></i> Quem vai retirar: ${escapeHtml(p.nomeResponsavelRetirada)}</p>` : ''}`
        : endereco ? `<p style="font-size:14px;">${escapeHtml(endereco.rua)}, ${escapeHtml(endereco.numero)}${endereco.complemento ? ' - ' + escapeHtml(endereco.complemento) : ''}<br>${escapeHtml(endereco.bairro)} — ${escapeHtml(endereco.cidade)}/${escapeHtml(endereco.estado)}<br>CEP ${escapeHtml(endereco.cep)}</p>` : ''}
    </div>

    <div class="card-panel" style="margin-bottom:16px;">
      <h4 style="font-size:13px; text-transform:uppercase; margin-bottom:10px; color:var(--text-muted);">Resumo Financeiro</h4>
      <div style="display:flex; justify-content:space-between; font-size:14px; padding:4px 0;"><span>Subtotal</span><span>${formatCurrency(p.subtotal)}</span></div>
      ${p.valorDesconto > 0 ? `<div style="display:flex; justify-content:space-between; font-size:14px; padding:4px 0; color:var(--success-color, #16a34a);"><span>Desconto${p.cupomCodigo ? ' (' + escapeHtml(p.cupomCodigo) + ')' : ''}</span><span>- ${formatCurrency(p.valorDesconto)}</span></div>` : ''}
      <div style="display:flex; justify-content:space-between; font-size:14px; padding:4px 0;"><span>Frete</span><span>${p.valorFrete > 0 ? formatCurrency(p.valorFrete) : 'Grátis'}</span></div>
      <div style="display:flex; justify-content:space-between; font-size:17px; font-weight:700; padding-top:10px; margin-top:6px; border-top:1px solid var(--border-color);"><span>Total</span><span style="color:var(--primary);">${formatCurrency(p.total)}</span></div>
    </div>

    <div class="card-panel" style="margin-bottom:18px;">
      <label style="display:flex; align-items:flex-start; gap:8px; font-size:13px; margin-bottom:10px; cursor:pointer;">
        <input type="checkbox" id="aceite-termos-uso" style="margin-top:2px;">
        <span>Li e aceito os <a href="termos.html" target="_blank">Termos de Uso</a></span>
      </label>
      <label style="display:flex; align-items:flex-start; gap:8px; font-size:13px; cursor:pointer;">
        <input type="checkbox" id="aceite-privacidade" style="margin-top:2px;">
        <span>Li e aceito a <a href="politica-privacidade.html" target="_blank">Política de Privacidade</a></span>
      </label>
    </div>

    <div id="erro-revisao" style="color:var(--danger-color, #dc2626); font-size:13px; margin-bottom:10px;"></div>
    <button class="btn" style="width:100%;" onclick="confirmarRevisaoEIrParaPagamento()">Confirmar e Ir para Pagamento</button>
  `;
}

function confirmarRevisaoEIrParaPagamento() {
  const erroEl = document.getElementById('erro-revisao');
  const aceitouTermos = document.getElementById('aceite-termos-uso').checked;
  const aceitouPrivacidade = document.getElementById('aceite-privacidade').checked;

  if (!aceitouTermos || !aceitouPrivacidade) {
    erroEl.textContent = 'Você precisa aceitar os Termos de Uso e a Política de Privacidade para continuar.';
    return;
  }

  renderizarEtapaPagamento();
}

// ---------------------------------------------------------------------------
// ETAPA — Pagamento
// ---------------------------------------------------------------------------
function renderizarEtapaPagamento() {
  renderizarCheckout();
}

function renderizarCheckout() {
  const container = document.getElementById('checkout-conteudo');
  const formasDisponiveis = (CHECKOUT_CONFIG.formasPagamento || []).filter((f) => f.status !== 'inativo');
  const temPix = CHECKOUT_CONFIG.integradoComMercadoPago && formasDisponiveis.some((f) => f.tipo === 'pix');
  const temCartao = CHECKOUT_CONFIG.integradoComMercadoPago && formasDisponiveis.some((f) => f.tipo === 'credito');
  const formaCartao = formasDisponiveis.find((f) => f.tipo === 'credito');

  container.innerHTML = `
    <div class="section-title" style="margin-top:20px;"><h2>Pagamento — Pedido #${PEDIDO_ATUAL.id}</h2></div>
    <div class="card-panel" style="margin-bottom:20px;">
      ${PEDIDO_ATUAL.itens.map((i) => `
        <div style="display:flex; justify-content:space-between; padding:6px 0; font-size:14px;">
          <span>${i.quantidade}x ${escapeHtml(i.nomeProduto)}</span>
          <span>${formatCurrency(i.quantidade * i.precoUnitario)}</span>
        </div>
      `).join('')}
      ${(PEDIDO_ATUAL.valorFrete > 0 || PEDIDO_ATUAL.tipoRecebimento) ? `
        <div style="display:flex; justify-content:space-between; padding:6px 0; font-size:14px; color:var(--text-muted);">
          <span>${PEDIDO_ATUAL.tipoRecebimento === 'retirada' ? 'Retirada na Loja' : 'Frete' + (PEDIDO_ATUAL.entrega ? ' — ' + escapeHtml(PEDIDO_ATUAL.entrega.nome) : '')}</span>
          <span>${PEDIDO_ATUAL.valorFrete > 0 ? formatCurrency(PEDIDO_ATUAL.valorFrete) : 'Grátis'}</span>
        </div>
      ` : ''}
      <div style="display:flex; justify-content:space-between; padding-top:12px; margin-top:8px; border-top:1px solid var(--border-color); font-weight:700; font-size:16px;">
        <span>Total</span><span style="color:var(--primary);">${formatCurrency(PEDIDO_ATUAL.total)}</span>
      </div>
    </div>

    ${!CHECKOUT_CONFIG.integradoComMercadoPago ? `
      <div class="card-panel" style="text-align:center;">
        <p style="margin-bottom:14px;">Pagamento online temporariamente indisponível. Finalize seu pedido pelo WhatsApp:</p>
        <button class="btn btn-whatsapp-loja" onclick="finalizarPorWhatsApp()"><i class="fa-brands fa-whatsapp"></i> Falar no WhatsApp</button>
      </div>
    ` : `
      <div class="section-title"><h2>Forma de Pagamento</h2></div>
      <div style="display:flex; gap:12px; margin-bottom:20px;">
        ${temPix ? `<div class="opcao-variacao" id="opcao-pix" onclick="selecionarFormaPagamento('pix')" style="flex:1; text-align:center; padding:16px;"><i class="fa-solid fa-qrcode" style="font-size:22px; display:block; margin-bottom:6px;"></i> Pix</div>` : ''}
        ${temCartao ? `<div class="opcao-variacao" id="opcao-cartao" onclick="selecionarFormaPagamento('cartao')" style="flex:1; text-align:center; padding:16px;">
          <i class="fa-solid fa-credit-card" style="font-size:22px; display:block; margin-bottom:6px;"></i> Cartão de Crédito/Débito
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
