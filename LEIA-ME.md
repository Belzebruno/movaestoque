# MOVA — controle de insumos

## Iniciar

Na pasta Controle de Estoque, execute `npm start`.
Requer Node.js 24 ou superior com npm. Não há dependências externas para instalar.
Abra http://localhost:3000 no computador. O terminal mostra também o endereço
para abrir no Chrome do tablet. Ambos precisam estar na mesma rede.
Mantenha o computador ligado e sem suspender durante o uso.
Se o Windows solicitar, permita o servidor na rede privada da empresa.

## Cadastros e retiradas

Entre na Área administrativa com usuário `admin` e senha `12345`.
Cadastre Insumos (incluindo o saldo inicial), Funcionários e Obras.
Cada registro tem botões de editar e excluir, disponíveis somente ao admin.
Os cadastros começam vazios. Todos os dispositivos usam o mesmo banco.

Na tela Nova retirada, selecione a obra, o produto, o funcionário e a quantidade.
Adicione os itens à lista e confirme a retirada. A confirmação reduz o saldo
no banco, com validação para impedir estoque negativo. O histórico fica no Admin.
Excluir um cadastro não apaga o nome registrado nas retiradas anteriores.

## Banco e backup

O banco SQLite é criado automaticamente em `painel/data/estoque.sqlite`.
Os dados permanecem após fechar o navegador ou reiniciar o servidor.
A estrutura está em `painel/schema.sql`; as tabelas principais são `insumos`,
`funcionarios` e `obras`, com tabelas auxiliares de retiradas e autenticação.

Para fazer backup, pare o servidor com Ctrl+C, copie o arquivo
`painel/data/estoque.sqlite` para um local seguro e inicie novamente.
Para restaurar, pare o servidor e substitua o banco pela cópia escolhida.
Não exclua a pasta data: ela contém os registros reais.

## Configuração e verificação

- `PORT`: porta do servidor (padrão 3000).
- `MOVA_DB_PATH`: caminho alternativo do banco.
- `MOVA_ADMIN_PASSWORD`: senha inicial alternativa, somente na criação do admin.
- `npm run check`: verifica a sintaxe.
- `npm test`: testes de integração com banco temporário, sem alterar dados reais.

O login é validado no servidor; a senha fica armazenada como hash.
As sessões expiram após oito horas ou quando o servidor reinicia.
O servidor usa HTTP e foi preparado para a rede local da empresa.
Acesso pela internet exige configuração adicional de HTTPS e hospedagem.
