# Gamer IA Store — versão inicial

## O que vem no projeto
- Loja responsiva com 3 produtos digitais de exemplo.
- Backend Node.js/Express.
- Criação de pagamento Pix pelo endpoint de pagamentos do Mercado Pago.
- Banco SQLite para pedidos.
- Webhook que exige assinatura secreta e consulta o pagamento no Mercado Pago antes de marcar como aprovado.
- Download liberado apenas para pedidos aprovados.
- Produtos digitais de exemplo na pasta privada.

## Importante antes de publicar
Esta é uma base inicial para teste, não uma loja pronta para produção. Não há cadastro/login de administrador, painel de gestão, e-mail automático, termos/política personalizados, tratamento completo de reembolso ou proteção contra abuso/rate limit. Teste tudo com credenciais de teste e revise a integração antes de aceitar dinheiro real.

## Rodar localmente
Requer Node.js 18 ou superior.
1. Extraia o ZIP.
2. No terminal, entre na pasta do projeto.
3. Execute `npm install`.
4. Configure variáveis de ambiente:
   - `MP_ACCESS_TOKEN`: token privado da aplicação Mercado Pago (somente no servidor).
   - `BASE_URL`: URL pública HTTPS do site, sem barra no fim.
   - `MP_WEBHOOK_SECRET`: chave secreta de assinatura do webhook no painel Mercado Pago.
5. Execute `npm start`.
6. Abra `http://localhost:3000`.

Sem essas variáveis, o site abre, mas o checkout fica desativado.

## Publicar gratuitamente (opção simples: Render)
O Render oferece plano gratuito para testes, mas pode suspender serviços por inatividade e não é indicado para uma loja comercial confiável. O sistema usa SQLite no disco local, que pode não ser persistente no serviço gratuito. Para produção, use banco persistente (por exemplo PostgreSQL gerenciado) e revise limites e custos atuais.
1. Crie um repositório GitHub com os arquivos deste projeto (não envie `.env`, tokens, banco de dados ou credenciais).
2. No Render, crie um Web Service conectado ao repositório.
3. Build command: `npm install`
4. Start command: `npm start`
5. Configure as variáveis de ambiente no painel do serviço. Nunca coloque o token do Mercado Pago em `public/index.html` nem em repositório público.
6. Configure a URL HTTPS de webhook do serviço no painel de integrações do Mercado Pago, com evento de pagamento e assinatura secreta. Use exatamente a URL pública `/api/webhooks/mercadopago`.
7. Teste o ciclo inteiro com credenciais de teste e confira se pedido pendente só libera download depois de aprovado.

## Idade e recebimento
Você tem 17 anos. Antes de abrir vendas, confira os termos atuais do provedor. Se não aceitar cadastro de menor, peça a um responsável legal para criar e administrar a conta e os recebimentos de forma legítima. Não falsifique idade ou identidade.

## Personalizar
- Textos e visual: `public/index.html`
- Produtos, valores e arquivos: objeto `products` em `server.js` e arquivos em `private_downloads/`
- Para mudar preços, atualize tanto o objeto `products` no servidor quanto os preços mostrados no HTML.
- Coloque nome de contato, termos de venda, política de privacidade, política de reembolso e informações do vendedor antes de operar.

## Documentação oficial
- Mercado Pago — notificações: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications
- Mercado Pago — referência da API: https://www.mercadopago.com.br/developers/pt/reference
- Render — serviços gratuitos e limitações: https://render.com/docs/free
- GitHub Pages hospeda apenas conteúdo estático; não execute este backend nele: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
