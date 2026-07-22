// ============================================================================
// Essencial Barber - Acompanhar Pedido (Fase 8 Parte 2B)
// ============================================================================
const ETAPAS_PEDIDO = [
  { status: 'recebido', label: 'Pedido Confirmado', icone: 'fa-check' },
  { status: 'separando', label: 'Preparando', icone: 'fa-box' },
  { status: 'transporte', label: 'A Caminho', icone: 'fa-truck' },
  { status: 'entregue', label: 'Entregue', icone: 'fa-house' }
];

document.addEventListener('DOMContentLoaded', async () => {
  const pedidoId = getQueryParam('id');
  const container = document.getElementById('pedido-conteudo');

  if (!pedidoId) {
    container.innerHTML = '<div class="empty-msg">Pedido não informado.</div>';
    return;
  }

  try {
    const pedido = await fetch(`${API_BASE}/pedidos/${pedidoId}/publico`).then((r) => { if (!r.ok) throw new Error('não encontrado'); return r.json(); });
    renderizarPedido(pedido);
  } catch (err) {
    console.error('Erro ao carregar pedido', err);
    container.innerHTML = '<div class="empty-msg">Pedido não encontrado.</div>';
  }
});

function renderizarPedido(pedido) {
  const container = document.getElementById('pedido-conteudo');

  if (pedido.status === 'cancelado') {
    container.innerHTML = `
      <div class="card-panel" style="text-align:center; padding:40px;">
        <div style="font-size:40px; margin-bottom:10px;">🚫</div>
        <h2>Pedido Cancelado</h2>
        <p style="color:var(--text-muted); margin-top:8px;">Pedido #${pedido.id}</p>
      </div>
    `;
    return;
  }

  const indiceAtual = ETAPAS_PEDIDO.findIndex((e) => e.status === pedido.status);

  container.innerHTML = `
    <div class="section-title"><h2>Pedido #${pedido.id}</h2></div>
    <div class="card-panel">
      <div class="timeline">
        ${ETAPAS_PEDIDO.map((etapa, i) => `
          <div class="timeline-etapa ${i < indiceAtual ? 'concluida' : ''} ${i === indiceAtual ? 'ativa' : ''}">
            <div class="bola"><i class="fa-solid ${etapa.icone}"></i></div>
            <span>${etapa.label}</span>
          </div>
        `).join('')}
      </div>

      ${pedido.codigoRastreio ? `
        <p style="text-align:center; font-size:13px; color:var(--text-muted);">Código de rastreio: <strong>${escapeHtml(pedido.codigoRastreio)}</strong></p>
        <p id="status-rastreio-vivo" style="text-align:center; font-size:13px; color:var(--primary); margin-top:6px;"></p>
      ` : ''}
      ${pedido.entrega ? `<p style="text-align:center; font-size:13px; color:var(--text-muted);">${escapeHtml(pedido.entrega.nome)} ${pedido.entrega.prazo ? '· ' + escapeHtml(pedido.entrega.prazo) : ''}</p>` : ''}
    </div>

    <div class="card-panel" style="margin-top:16px;">
      <h4 style="font-size:13px; text-transform:uppercase; margin-bottom:10px;">Itens do Pedido</h4>
      ${pedido.itens.map((i) => `
        <div style="display:flex; justify-content:space-between; padding:6px 0; font-size:14px;">
          <span>${i.quantidade}x ${escapeHtml(i.nomeProduto)}</span>
          <span>${formatCurrency(i.quantidade * i.precoUnitario)}</span>
        </div>
      `).join('')}
      <div style="display:flex; justify-content:space-between; padding-top:10px; margin-top:8px; border-top:1px solid var(--border-color); font-weight:700;">
        <span>Total</span><span style="color:var(--primary);">${formatCurrency(pedido.total)}</span>
      </div>
    </div>
  `;

  if (pedido.codigoRastreio) {
    buscarStatusRastreioAoVivo(pedido.id);
  }
}

async function buscarStatusRastreioAoVivo(pedidoId) {
  const elemento = document.getElementById('status-rastreio-vivo');
  if (!elemento) return;
  try {
    const resultado = await fetch(`${API_BASE}/pedidos/${pedidoId}/rastreio`).then((r) => r.json());
    if (resultado.disponivel && resultado.status) {
      elemento.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${escapeHtml(String(resultado.status))}`;
    }
  } catch (err) {
    console.error('Erro ao buscar status de rastreio ao vivo', err);
  }
}
