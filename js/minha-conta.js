// ============================================================================
// Essencial Barber - Minha Conta (Fase 24)
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  if (!CONTA_CLIENTE) {
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('conta-nome-exibido').textContent = CONTA_CLIENTE.info.nome;

  try {
    const resposta = await fetch(`${API_BASE}/loja/conta/pedidos`, {
      headers: { Authorization: `Bearer ${CONTA_CLIENTE.token}` }
    });

    if (resposta.status === 401) {
      // Sessão expirada ou inválida — desloga e manda pra Home, sem
      // deixar a pessoa presa numa tela quebrada.
      sairDaConta();
      return;
    }

    const pedidos = await resposta.json();
    renderizarPedidosConta(pedidos);
  } catch (err) {
    console.error('Erro ao carregar pedidos da conta', err);
    document.getElementById('lista-pedidos-conta').innerHTML = '<div class="empty-msg">Não foi possível carregar seus pedidos agora.</div>';
  }
});

const STATUS_PEDIDO_LABEL = {
  recebido: 'Pedido Confirmado', separando: 'Preparando', transporte: 'A Caminho',
  entregue: 'Entregue', cancelado: 'Cancelado'
};

function renderizarPedidosConta(pedidos) {
  const container = document.getElementById('lista-pedidos-conta');

  if (!Array.isArray(pedidos) || pedidos.length === 0) {
    container.innerHTML = '<div class="empty-msg">Você ainda não fez nenhum pedido.</div>';
    return;
  }

  container.innerHTML = pedidos.map((p) => `
    <a href="pedido.html?id=${p.id}" style="display:flex; justify-content:space-between; align-items:center; padding:14px; border:1px solid var(--border-color); border-radius:8px; margin-bottom:10px; text-decoration:none; color:inherit;">
      <div>
        <strong style="font-size:14px;">Pedido #${p.id}</strong>
        <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
          ${new Date(p.criadoEm).toLocaleDateString('pt-BR')} · ${escapeHtml(STATUS_PEDIDO_LABEL[p.status] || p.status)}
        </div>
      </div>
      <strong style="color:var(--primary);">${formatCurrency(p.total)}</strong>
    </a>
  `).join('');
}

function falarNoWhatsAppMinhaConta() {
  const mensagem = encodeURIComponent(`Olá! Tenho uma dúvida sobre minha compra (${CONTA_CLIENTE ? CONTA_CLIENTE.info.nome : ''}).`);
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${mensagem}`, '_blank');
}
