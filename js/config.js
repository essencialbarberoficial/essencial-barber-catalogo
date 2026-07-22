// ============================================================================
// Essencial Barber - Configuração do Catálogo
// ============================================================================
// Quando o catálogo roda no MESMO computador que o backend (localhost),
// usamos o caminho relativo "/api" — funciona direto, sem configurar nada.
//
// Quando o catálogo estiver publicado no seu domínio (ex:
// essencialbarber.com.br) e o backend estiver hospedado em outro endereço
// (ex: Railway), o catálogo precisa saber a URL completa da API. Troque a
// linha abaixo pela URL real do seu backend depois de fazer o deploy dele
// (Fase 8.0.3) — é a ÚNICA linha que precisa editar neste arquivo.
// ---------------------------------------------------------------------------
const API_URL_PRODUCAO = 'https://SUBSTITUA-PELA-URL-DO-SEU-BACKEND.up.railway.app/api';

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? '/api'
  : API_URL_PRODUCAO;
