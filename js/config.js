// ============================================================================
// Essencial Barber - Configuração do Catálogo
// ============================================================================
// Quando o catálogo estiver publicado no seu domínio (ex:
// essencialbarber.com.br) e o backend estiver hospedado em outro endereço
// (ex: Railway), o catálogo precisa saber a URL completa da API. Troque a
// linha abaixo pela URL real do seu backend depois de fazer o deploy dele
// (Fase 8.0.3) — é a ÚNICA linha que precisa editar neste arquivo.
// ---------------------------------------------------------------------------
const API_URL_PRODUCAO = 'https://essencial-barber-backend-production.up.railway.app/api';

// CORREÇÃO: "/api" (caminho relativo) só funciona se o Catálogo estiver
// sendo servido EXATAMENTE pela mesma porta do backend — o que não
// acontece ao testar localmente com um servidor estático separado (Live
// Server, `npx serve`, etc.), já que o backend do ERP sempre roda fixo na
// porta 3000 (`npm start`). Agora aponta direto pra porta 3000, não
// importa qual porta esteja servindo os arquivos do Catálogo em si.
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000/api'
  : API_URL_PRODUCAO;
