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
validado no servidor. Excluir insumos ou funcionários preserva os nomes no histórico. Excluir uma obra apaga suas retiradas, os itens dessas retiradas e seu checklist, sem devolver saldo ao estoque.
O Admin pode consultar o histórico. As sessões duram oito horas e, no Neon,
continuam válidas mesmo quando a Vercel troca de instância.

No celular e tablet, selecione obra, funcionário e produtos para adicionar à lista.
Deslize para o lado para ajustar quantidades e conferir.
Confirme a retirada com a senha pessoal de quatro dígitos para salvar.
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

## PIN dos funcionários e lista mobile

No tablet, selecione obra e funcionário, escolha produto e quantidade e toque
em Adicionar à retirada. Repita para outros produtos. Deslize horizontalmente
para conferir, ajustar quantidades ou remover itens.
Depois de conferir, a confirmação abre o teclado numérico de senha.

Cada funcionário cadastra um PIN de exatamente quatro dígitos, confirmado duas
vezes, na primeira autorização. Nas seguintes, informa o PIN uma vez.
A senha é validada no servidor em toda retirada, incluindo reenvios, e fica
armazenada como hash com salt na tabela `funcionario_pins`. O PIN não é salvo
no navegador, no histórico nem retornado pelo catálogo. Cinco erros bloqueiam
esse funcionário por 15 minutos. Fechar o teclado cancela a autorização.

O primeiro cadastro de PIN não comprova identidade: acompanhe esse primeiro
acesso para que cada funcionário cadastre o próprio PIN. O cadastro do PIN é
salvo na autorização; caso o estoque impeça a retirada, ele permanece válido
para a próxima tentativa. A migração é aditiva e preserva cadastros e histórico.

No mobile, apenas a lista de itens rola verticalmente; o botão de conferência permanece visível.
## Checklist privado de projetos

Entre na Área administrativa com belzebruno e abra a aba Checklist de projetos. O acesso é
exclusivo da conta belzebruno, com sessão própria e senha derivada por scrypt
no banco. A sessão do admin do estoque não autoriza estas rotas.
Selecione uma obra existente, adicione ambientes e edite seus nomes diretamente.
Projeto, Conferência, Fita e Exportação são checks independentes, salvos no banco.
Conflitos entre abas não sobrescrevem silenciosamente o progresso: atualize a lista.
Excluir uma obra no estoque apaga seus ambientes, checks, retiradas e respectivos itens. Outras obras e os cadastros compartilhados de insumos e funcionários são preservados.

Para preparar uma nova instalação, defina MOVA_CHECKLIST_PASSWORD no ambiente
somente durante a execução de `node --env-file-if-exists=.env.local painel/setup-checklist.mjs`.
O comando cria a conta se ainda não existir e não altera uma senha existente.
Nunca inclua a senha em arquivos versionados ou no frontend.
## Histórico de retiradas e CSV

Na área administrativa, a aba Retiradas mostra uma linha por item retirado.
Combine filtros de funcionário, produto, obra e período (datas inclusivas, horário de Brasília).
Exportar resultados CSV inclui todas as páginas filtradas; Exportar tudo CSV inclui todo o histórico carregado.
Use Atualizar histórico para buscar registros recentes. O CSV usa UTF-8, separador ponto e vírgula e quantidades com vírgula decimal.
