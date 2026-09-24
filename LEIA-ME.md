# MOVA — controle de estoque

## Site publicado

O frontend está em `painel/dist` e a API da Vercel em `api/index.mjs`.
As chamadas `/api/*` são encaminhadas ao backend por `vercel.json`.
O backend consulta o PostgreSQL do Neon usando `DATABASE_URL`, configurada
como segredo de produção na Vercel. A conexão nunca é enviada ao navegador.
Após alterar variáveis na Vercel, faça um novo deploy para aplicá-las.

## Rodar no computador

Requer Node.js 24 ou superior e npm:

```sh
npm install
npm start
```

Configure `DATABASE_URL` em `.env.local` para usar Neon. Consulte `.env.example`.
Sem essa variável, o servidor local usa o SQLite em `painel/data/estoque.sqlite`.
Os dois bancos são independentes; não há cópia automática entre eles.
Abra http://localhost:3000. Para acesso pela rede local, use o endereço que o
terminal mostra e mantenha o computador ligado.

## Criar ou atualizar tabelas

```sh
npm run db:migrate
```

A migração versionada em `painel/schema-postgres.sql` usa
`DATABASE_URL_UNPOOLED` (conexão direta), ou `DATABASE_URL` quando não há outra.
Ela cria tabelas ausentes sem apagar registros. Execute em ambiente de teste
antes de produção. O deploy do site não executa migrações automaticamente.

Tabelas: `insumos`, `funcionarios`, `obras`, `administradores`, `retiradas`,
`retirada_itens`, `sessoes_admin` e `tentativas_login`.
Quantidades são armazenadas em milésimos inteiros, evitando erros de arredondamento.
Retiradas usam transações e bloqueios de linha para impedir saldo negativo;
reenvios da mesma confirmação não descontam o estoque novamente.

## Uso

No PC, entre na Área administrativa com `admin` / `12345` e cadastre insumos
(com saldo inicial), funcionários e obras. Os botões editar/excluir exigem login
validado no servidor. A exclusão preserva os nomes no histórico de retiradas.
O Admin pode consultar o histórico. As sessões duram oito horas e, no Neon,
continuam válidas mesmo quando a Vercel troca de instância.

No celular e tablet, a tela mostra apenas a logo e três seletores, como solicitado.
Toque em Confirmar retirada, confira os dados e a quantidade e confirme para salvar.
No PC, adicione os itens, confira e confirme para registrar e reduzir o saldo.

A senha inicial alternativa pode ser definida por `MOVA_ADMIN_PASSWORD` antes
somente da primeira migração que criar o administrador.

## Verificação

- `npm run check`: sintaxe do frontend e backend.
- `npm test`: testes SQLite temporários; testes Postgres são ignorados sem configuração.
- Para os testes Postgres, use uma branch Neon descartável e vazia, execute a migração
  nela, e passe a conexão por `MOVA_TEST_DATABASE_URL` ao executar
  `node --test painel/tests/postgres.test.mjs`. Nunca use a produção para esses testes.

## Dados e backup

O banco Neon é compartilhado pelos dispositivos e permanece após um deploy.
Use os recursos de backup/restauração do Neon para ele.
Para o SQLite local, pare o servidor antes de copiar `painel/data/estoque.sqlite`.
Credenciais, banco local e arquivos temporários ficam fora do Git e do deploy.
