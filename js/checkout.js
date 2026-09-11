// ============================================================================
// Essencial Barber - Checkout (Fase 8 Parte 2B + Fase 15 Parte 3 + Fase 25)
// ============================================================================

// Protege contra o gesto de arrastar (voltar/avançar) do navegador mobile
// mostrando uma versão antiga da tela, guardada em memória (bfcache) —
// crítico aqui, já que essa tela lida com pagamento. Se a página foi
// restaurada da memória em vez de carregada de novo, força um recarregamento
// de verdade, que busca o estado atual do pedido.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});

let PEDIDO_ATUAL = null;
let CHECKOUT_CONFIG = null;
let ENTREGAS_DISPONIVEIS = null;
let COTACOES_FRETE = [];
let ENTREGA_ESCOLHIDA = null; // { tipoRecebimento, entregaId, valorFrete, nome }
let INTERVALO_POLLING_PIX = null;
let MP_INSTANCE = null;

// Fase 25 — Checkout Completo: nenhum pedido existe ainda quando a pessoa
// chega aqui vinda do carrinho ou do "Comprar" — só depois que ela
// preenche os dados completos (Etapa 0) é que o pedido é criado de
// verdade. Nunca pede login/senha nesse caminho.
let ITENS_CHECKOUT = null;
let MODO_COMPRAR_AGORA = false;
let CLIENTE_ENCONTRADO_CHECKOUT = null;
let BUSCA_CLIENTE_JA_DISPAROU = false;

document.addEventListener('DOMContentLoaded', async () => {
  const pedidoId = getQueryParam('pedido');
  const container = document.getElementById('checkout-conteudo');

  try {
    [CHECKOUT_CONFIG, ENTREGAS_DISPONIVEIS] = await Promise.all([
      fetch(`${API_BASE}/checkout/config`).then((r) => r.json()),
      fetch(`${API_BASE}/entregas/disponiveis`).then((r) => r.json())
    ]);

    if (pedidoId) {
      // Voltando pra um pedido que já existe (ex: link de pagamento
      // pendente reaberto, ou a página recarregada com um Pix já gerado).
      const [pedidoCarregado, statusCarregado] = await Promise.all([
        fetch(`${API_BASE}/pedidos/${pedidoId}/publico`).then((r) => { if (!r.ok) throw new Error('não encontrado'); return r.json(); }),
        fetch(`${API_BASE}/checkout/status/${pedidoId}`).then((r) => r.json())
      ]);
      PEDIDO_ATUAL = pedidoCarregado;

      if (PEDIDO_ATUAL.pago) {
        window.location.href = `confirmacao.html?pedido=${pedidoId}`;
        return;
      }

      // Já existe uma tentativa de pagamento (Pix gerado, mesmo que ainda
      // pendente) — pula direto pra tela de Pagamento, em vez de voltar
      // pra Entrega (que ficaria travada com "pedido já pago/em
      // andamento e não pode ser alterado", sem deixar continuar).
      if (statusCarregado.statusPagamento) {
        renderizarEtapaPagamento();
        return;
      }

      renderizarEtapaEntrega();
      return;
    }

    // Fluxo normal: vindo do carrinho ou do "Comprar" — ainda sem pedido.
    const compraAvulsaSalva = localStorage.getItem('buyNowItem');
    if (compraAvulsaSalva) {
      MODO_COMPRAR_AGORA = true;
      ITENS_CHECKOUT = [JSON.parse(compraAvulsaSalva)];
    } else {
      ITENS_CHECKOUT = JSON.parse(localStorage.getItem('cart') || '[]');
    }

    if (!ITENS_CHECKOUT || ITENS_CHECKOUT.length === 0) {
      container.innerHTML = '<div class="empty-msg">Seu carrinho está vazio.</div>';
      return;
    }

    // Se o cliente já está com sessão ativa (já criou senha antes), não
    // precisa preencher os dados de novo — busca o que já se sabe sobre
    // ele e pula direto pra Entrega.
    if (CONTA_CLIENTE) {
      try {
        const conta = await fetch(`${API_BASE}/loja/conta/me`, {
          headers: { Authorization: `Bearer ${CONTA_CLIENTE.token}` }
        }).then((r) => { if (!r.ok) throw new Error('sessão inválida'); return r.json(); });

        if (conta.documento && conta.dataNascimento && conta.telefone) {
          const iniciado = await iniciarCheckoutComDadosDaConta(conta);
          if (iniciado) return;
        }
        // Se faltar algum dado essencial (ex: conta antiga sem CPF ainda),
        // cai pra Etapa 0 normal, já com o que se sabe pré-preenchido.
        renderizarEtapaDadosCliente(conta);
        return;
      } catch (err) {
        console.error('Sessão de conta inválida, seguindo sem login', err);
        // Sessão expirada/inválida — não trava o checkout por isso, só
        // segue como se não estivesse logado.
      }
    }

    renderizarEtapaDadosCliente();
  } catch (err) {
    console.error('Erro ao carregar checkout', err);
    container.innerHTML = '<div class="empty-msg">Não foi possível carregar o checkout.</div>';
  }
});

async function iniciarCheckoutComDadosDaConta(conta) {
  const itens = ITENS_CHECKOUT.map((i) => ({
    produtoId: i.id, variacaoId: i.variacaoId || null, nome: i.nome, quantidade: i.qty, precoUnitario: i.preco
  }));

  const cupomSalvo = JSON.parse(localStorage.getItem('cupomAplicadoCheckout') || 'null');
  const vendedorSalvo = JSON.parse(localStorage.getItem('vendedorAplicadoCheckout') || 'null');

  try {
    const dados = await fetch(`${API_BASE}/loja/checkout/iniciar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documento: conta.documento, nome: conta.nome, dataNascimento: conta.dataNascimento,
        telefone: conta.telefone, email: conta.email, itens,
        cupomCodigo: cupomSalvo ? cupomSalvo.codigo : null,
        vendedorId: vendedorSalvo ? vendedorSalvo.vendedorId : null,
        valorDesconto: cupomSalvo ? cupomSalvo.desconto : 0
      })
    }).then((r) => r.json());

    if (!dados.pedidoId) return false;

    if (MODO_COMPRAR_AGORA) localStorage.removeItem('buyNowItem');
    else { localStorage.removeItem('cart'); CART = []; }
    localStorage.removeItem('cupomAplicadoCheckout');
    localStorage.removeItem('vendedorAplicadoCheckout');

    // Cliente logado já vai acompanhar pela conta — não precisa do
    // convite de criar senha na confirmação de novo.
    localStorage.removeItem('checkoutDadosRecentes');

    CLIENTE_ENCONTRADO_CHECKOUT = conta; // já usa o endereço salvo na Etapa Entrega
    PEDIDO_ATUAL = await fetch(`${API_BASE}/pedidos/${dados.pedidoId}/publico`).then((r) => r.json());
    // Reflete o pedido na URL — cada checkout ganha um endereço próprio,
    // sem precisar recarregar a página.
    history.replaceState(null, '', `checkout.html?pedido=${PEDIDO_ATUAL.id}`);
    renderizarEtapaEntrega();
    return true;
  } catch (err) {
    console.error('Erro ao iniciar checkout com dados da conta', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// ETAPA 0 — Seus Dados: coletados ANTES de qualquer coisa (nome completo,
// CPF, nascimento, WhatsApp, e-mail). A busca de cliente existente só
// dispara depois que os 3 campos identificadores (CPF, telefone, e-mail)
// estiverem preenchidos — não a cada campo isolado. Se a pessoa já está
// logada mas faltava algum dado (ex: conta antiga sem CPF), o que já se
// sabe vem pré-preenchido.
// ---------------------------------------------------------------------------
function renderizarEtapaDadosCliente(dadosConhecidos) {
  const d = dadosConhecidos || {};
  const container = document.getElementById('checkout-conteudo');
  container.innerHTML = `
    <div class="section-title" style="margin-top:20px;"><h2>Seus Dados</h2></div>
    <div class="card-panel" style="margin-bottom:18px;">
      <div class="form-group"><label>Nome Completo *</label><input type="text" id="dc-nome" class="form-control" value="${escapeHtml(d.nome || '')}" required></div>
      <div style="display:flex; gap:10px;">
        <div class="form-group" style="flex:1;"><label>CPF *</label><input type="text" id="dc-cpf" class="form-control" placeholder="000.000.000-00" value="${escapeHtml(d.documento || '')}" required></div>
        <div class="form-group" style="flex:1;"><label>Data de Nascimento *</label><input type="text" id="dc-nascimento" class="form-control campo-data-nascimento" placeholder="DD/MM/AAAA" inputmode="numeric" maxlength="10" value="${d.dataNascimento ? formatarDataParaExibicao(d.dataNascimento) : ''}" required></div>
      </div>
      <div class="form-group"><label>WhatsApp *</label><input type="text" id="dc-telefone" class="form-control" placeholder="(00) 00000-0000" value="${escapeHtml(d.telefone || '')}" required></div>
      <div class="form-group"><label>E-mail *</label><input type="email" id="dc-email" class="form-control" value="${escapeHtml(d.email || '')}" required></div>
      <p id="dc-encontrado-msg" style="font-size:13px; color:var(--success-color, #16a34a); display:none; margin-top:6px;"><i class="fa-solid fa-circle-check"></i> Encontramos seu cadastro! Seu endereço salvo vai aparecer na próxima etapa (você pode editar lá).</p>
    </div>
    <div id="erro-dados-cliente" style="color:var(--danger-color, #dc2626); font-size:13px; margin-bottom:10px;"></div>
    <button class="btn" style="width:100%;" onclick="confirmarEtapaDadosCliente()">Continuar</button>
  `;

  aplicarMascaraDataNascimento();

  ['dc-cpf', 'dc-telefone', 'dc-email'].forEach((id) => {
    document.getElementById(id).addEventListener('blur', tentarBuscarClienteCheckout);
  });
}

// Converte "1990-05-20" (formato do banco) pra "20/05/1990" (formato exibido no campo)
function formatarDataParaExibicao(dataISO) {
  const partes = (dataISO || '').split('-');
  if (partes.length !== 3) return '';
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

// Converte "20/05/1990" (formato digitado) pra "1990-05-20" (formato do banco)
function converterDataParaISO(dataBR) {
  const partes = (dataBR || '').split('/');
  if (partes.length !== 3 || partes[2].length !== 4) return '';
  return `${partes[2]}-${partes[1]}-${partes[0]}`;
}

// Máscara simples de data enquanto digita (DD/MM/AAAA) — mais previsível
// e consistente entre navegadores do que o seletor nativo de calendário.
function aplicarMascaraDataNascimento() {
  const campo = document.querySelector('.campo-data-nascimento');
  if (!campo) return;
  campo.addEventListener('input', () => {
    let digitos = campo.value.replace(/\D/g, '').slice(0, 8);
    if (digitos.length >= 5) digitos = `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
    else if (digitos.length >= 3) digitos = `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
    campo.value = digitos;
  });
}

async function tentarBuscarClienteCheckout() {
  if (BUSCA_CLIENTE_JA_DISPAROU) return;

  const cpf = document.getElementById('dc-cpf').value.trim();
  const telefone = document.getElementById('dc-telefone').value.trim();
  const email = document.getElementById('dc-email').value.trim();
  if (!cpf || !telefone || !email) return; // só busca depois que os 3 estiverem preenchidos

  try {
    const dados = await fetch(`${API_BASE}/loja/checkout/buscar-cliente`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documento: cpf, telefone, email })
    }).then((r) => r.json());

    if (dados.encontrado) {
      BUSCA_CLIENTE_JA_DISPAROU = true;
      CLIENTE_ENCONTRADO_CHECKOUT = dados;
      document.getElementById('dc-nome').value = dados.nome;
      document.getElementById('dc-encontrado-msg').style.display = 'block';
    }
  } catch (err) {
    console.error('Erro ao buscar cliente existente', err);
    // Não bloqueia o checkout se a busca falhar — só não pré-preenche nada.
  }
}

async function confirmarEtapaDadosCliente() {
  const erroEl = document.getElementById('erro-dados-cliente');
  erroEl.textContent = '';

  const nome = document.getElementById('dc-nome').value.trim();
  const cpf = document.getElementById('dc-cpf').value.trim();
  const nascimentoDigitado = document.getElementById('dc-nascimento').value.trim();
  const nascimento = converterDataParaISO(nascimentoDigitado);
  const telefone = document.getElementById('dc-telefone').value.trim();
  const email = document.getElementById('dc-email').value.trim();

  if (!nome || !cpf || !nascimentoDigitado || !telefone || !email) {
    erroEl.textContent = 'Preencha todos os campos pra continuar.';
    return;
  }
  if (!nascimento) {
    erroEl.textContent = 'Data de nascimento inválida. Use o formato DD/MM/AAAA.';
    return;
  }
  if (!validarCPF(cpf)) {
    erroEl.textContent = 'CPF inválido. Confira os números digitados.';
    return;
  }

  const itens = ITENS_CHECKOUT.map((i) => ({
    produtoId: i.id, variacaoId: i.variacaoId || null, nome: i.nome, quantidade: i.qty, precoUnitario: i.preco
  }));

  const cupomSalvo = JSON.parse(localStorage.getItem('cupomAplicadoCheckout') || 'null');
  const vendedorSalvo = JSON.parse(localStorage.getItem('vendedorAplicadoCheckout') || 'null');

  try {
    const dados = await fetch(`${API_BASE}/loja/checkout/iniciar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documento: cpf, nome, dataNascimento: nascimento, telefone, email, itens,
        cupomCodigo: cupomSalvo ? cupomSalvo.codigo : null,
        vendedorId: vendedorSalvo ? vendedorSalvo.vendedorId : null,
        valorDesconto: cupomSalvo ? cupomSalvo.desconto : 0
      })
    }).then((r) => r.json());

    if (!dados.pedidoId) { erroEl.textContent = dados.error || 'Não foi possível iniciar o checkout.'; return; }

    // O carrinho (ou a compra avulsa) já virou pedido — limpa, pra não
    // duplicar se a pessoa voltar pro catálogo depois.
    if (MODO_COMPRAR_AGORA) localStorage.removeItem('buyNowItem');
    else { localStorage.removeItem('cart'); CART = []; }
    localStorage.removeItem('cupomAplicadoCheckout');
    localStorage.removeItem('vendedorAplicadoCheckout');

    // O e-mail/nome já foram digitados agora mesmo — guarda temporariamente
    // pra tela de confirmação oferecer a criação de senha sem precisar
    // buscar isso de novo (e sem expor esse dado numa rota pública).
    localStorage.setItem('checkoutDadosRecentes', JSON.stringify({ nome, email }));

    PEDIDO_ATUAL = await fetch(`${API_BASE}/pedidos/${dados.pedidoId}/publico`).then((r) => r.json());
    // Reflete o pedido na URL — cada checkout ganha um endereço próprio,
    // sem precisar recarregar a página.
    history.replaceState(null, '', `checkout.html?pedido=${PEDIDO_ATUAL.id}`);
    renderizarEtapaEntrega();
  } catch (err) {
    console.error('Erro ao iniciar checkout', err);
    erroEl.textContent = 'Erro ao conectar. Tente novamente.';
  }
}

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
          <input type="text" id="ent-cep" class="form-control" placeholder="CEP" value="${escapeHtml(enderecoSalvo.cep || (CLIENTE_ENCONTRADO_CHECKOUT && CLIENTE_ENCONTRADO_CHECKOUT.cep) || usuario.cep || '')}" style="max-width:160px;">
          <button class="btn-secondary btn" onclick="buscarCep()">Buscar CEP</button>
        </div>
        <div class="form-group"><label>Rua</label><input type="text" id="ent-rua" class="form-control" value="${escapeHtml(enderecoSalvo.rua || (CLIENTE_ENCONTRADO_CHECKOUT && CLIENTE_ENCONTRADO_CHECKOUT.rua) || '')}"></div>
        <div style="display:flex; gap:10px;">
          <div class="form-group" style="flex:1;"><label>Número</label><input type="text" id="ent-numero" class="form-control" value="${escapeHtml(enderecoSalvo.numero || (CLIENTE_ENCONTRADO_CHECKOUT && CLIENTE_ENCONTRADO_CHECKOUT.numero) || '')}"></div>
          <div class="form-group" style="flex:2;"><label>Complemento</label><input type="text" id="ent-complemento" class="form-control" value="${escapeHtml(enderecoSalvo.complemento || (CLIENTE_ENCONTRADO_CHECKOUT && CLIENTE_ENCONTRADO_CHECKOUT.complemento) || '')}"></div>
        </div>
        <div class="form-group"><label>Bairro</label><input type="text" id="ent-bairro" class="form-control" value="${escapeHtml(enderecoSalvo.bairro || (CLIENTE_ENCONTRADO_CHECKOUT && CLIENTE_ENCONTRADO_CHECKOUT.bairro) || usuario.bairro || '')}"></div>
        <div style="display:flex; gap:10px;">
          <div class="form-group" style="flex:2;"><label>Cidade</label><input type="text" id="ent-cidade" class="form-control" value="${escapeHtml(enderecoSalvo.cidade || (CLIENTE_ENCONTRADO_CHECKOUT && CLIENTE_ENCONTRADO_CHECKOUT.cidade) || '')}"></div>
          <div class="form-group" style="flex:1;"><label>Estado</label><input type="text" id="ent-estado" class="form-control" maxlength="2" value="${escapeHtml(enderecoSalvo.estado || (CLIENTE_ENCONTRADO_CHECKOUT && CLIENTE_ENCONTRADO_CHECKOUT.estado) || '')}"></div>
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
  // Se já tinha frete calculado antes, ou se achamos um endereço salvo do
  // cliente na Etapa 0, recalcula pra já mostrar as opções de frete.
  if (tipoJaEscolhido === 'entrega' && (enderecoSalvo.cep || (CLIENTE_ENCONTRADO_CHECKOUT && CLIENTE_ENCONTRADO_CHECKOUT.cep))) {
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
      <h4 style="font-size:13px; text-transform:uppercase; margin-bottom:10px; color:var(--text-muted);">Observação (opcional)</h4>
      <textarea id="observacao-cliente-checkout" rows="2" maxlength="500" placeholder="Alguma observação sobre o seu pedido? Ex: ponto de referência, preferência de horário..." style="width:100%; padding:10px; border:1px solid var(--border-color); border-radius:8px; resize:none; font-family:inherit;">${escapeHtml(p.observacoesCliente || '')}</textarea>
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

  const observacoesCliente = document.getElementById('observacao-cliente-checkout').value.trim();
  fetch(`${API_BASE}/pedidos/${PEDIDO_ATUAL.id}/definir-observacao`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ observacoesCliente })
  }).catch((err) => console.error('Erro ao salvar observação', err));
  // Não bloqueia o avanço pro pagamento se isso falhar — a observação é
  // um detalhe complementar, não pode travar a compra.
  PEDIDO_ATUAL.observacoesCliente = observacoesCliente;

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
  const dadosRecentes = JSON.parse(localStorage.getItem('checkoutDadosRecentes') || 'null');
  const nome = dadosRecentes ? dadosRecentes.nome : '';

  const itens = PEDIDO_ATUAL.itens.map((i) => `• ${i.quantidade}x ${i.nomeProduto}`).join('\n');

  let entregaTexto;
  if (PEDIDO_ATUAL.tipoRecebimento === 'retirada') {
    entregaTexto = `Retirada na loja${PEDIDO_ATUAL.nomeResponsavelRetirada ? ` (retirado por: ${PEDIDO_ATUAL.nomeResponsavelRetirada})` : ''}`;
  } else if (PEDIDO_ATUAL.enderecoEntrega) {
    const e = PEDIDO_ATUAL.enderecoEntrega;
    entregaTexto = `Entrega em: ${e.rua || ''}, ${e.numero || ''}${e.complemento ? ' - ' + e.complemento : ''}, ${e.bairro || ''}, ${e.cidade || ''}/${e.estado || ''} - CEP ${e.cep || ''}`;
  } else {
    entregaTexto = 'A combinar';
  }

  const partes = [
    `Olá! Gostaria de finalizar o pedido #${PEDIDO_ATUAL.id}.`,
    nome ? `Nome: ${nome}` : null,
    '',
    itens,
    '',
    entregaTexto,
    '',
    `Total: ${formatCurrency(PEDIDO_ATUAL.total)}`
  ].filter((linha) => linha !== null).join('\n');

  const mensagem = encodeURIComponent(partes);
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${mensagem}`, '_blank');
}

function selecionarFormaPagamento(forma) {
  document.querySelectorAll('.opcao-variacao').forEach((el) => el.classList.remove('selecionada'));
  document.getElementById(`opcao-${forma}`).classList.add('selecionada');

  document.getElementById('painel-pix').style.display = forma === 'pix' ? 'block' : 'none';
  document.getElementById('painel-cartao').style.display = forma === 'cartao' ? 'block' : 'none';

  // Ao sair do Pix, para de verificar o status dele em segundo plano —
  // sem isso, o polling continuava rodando escondido mesmo depois do
  // cliente trocar pra Cartão, podendo redirecionar sozinho pra
  // confirmação se aquele Pix (o anterior) fosse pago depois.
  if (forma !== 'pix' && INTERVALO_POLLING_PIX) {
    clearInterval(INTERVALO_POLLING_PIX);
    INTERVALO_POLLING_PIX = null;
  }

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
let CARD_BRICK_CONTROLLER = null; // controla o formulário de cartão do Mercado Pago, pra poder desmontar antes de recriar

async function iniciarPagamentoCartao() {
  const container = document.getElementById('card-payment-brick-container');

  // O SDK do Mercado Pago mantém o formulário anterior "vivo" internamente
  // mesmo depois de limpar o HTML do container — sem desmontar de
  // verdade, a segunda tentativa de criar o formulário (ex: cliente troca
  // pra Pix e volta pro Cartão) falha com "tente novamente mais tarde".
  if (CARD_BRICK_CONTROLLER) {
    try { await CARD_BRICK_CONTROLLER.unmount(); } catch (err) { /* já tinha sido desmontado, ignora */ }
    CARD_BRICK_CONTROLLER = null;
  }
  container.innerHTML = '';

  if (!CHECKOUT_CONFIG.publicKey) {
    container.innerHTML = '<div class="empty-msg">Pagamento por cartão indisponível no momento.</div>';
    return;
  }

  if (!MP_INSTANCE) {
    MP_INSTANCE = new MercadoPago(CHECKOUT_CONFIG.publicKey, { locale: 'pt-BR' });
  }

  const bricksBuilder = MP_INSTANCE.bricks();

  CARD_BRICK_CONTROLLER = await bricksBuilder.create('cardPayment', 'card-payment-brick-container', {
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
