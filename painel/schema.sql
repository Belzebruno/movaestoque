PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS insumos (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 nome TEXT NOT NULL CHECK(length(trim(nome)) BETWEEN 1 AND 80),
 especificacao TEXT NOT NULL DEFAULT '',
 categoria TEXT NOT NULL,
 unidade TEXT NOT NULL,
 saldo_milesimos INTEGER NOT NULL DEFAULT 0 CHECK(saldo_milesimos >= 0),
 versao INTEGER NOT NULL DEFAULT 1,
 criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE IF NOT EXISTS funcionarios (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 nome TEXT NOT NULL CHECK(length(trim(nome)) BETWEEN 1 AND 80),
 versao INTEGER NOT NULL DEFAULT 1,
 criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE IF NOT EXISTS obras (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 nome TEXT NOT NULL CHECK(length(trim(nome)) BETWEEN 1 AND 80),
 versao INTEGER NOT NULL DEFAULT 1,
 criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE IF NOT EXISTS administradores (
 usuario TEXT PRIMARY KEY,
 salt TEXT NOT NULL,
 senha_hash TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS retiradas (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 chave_requisicao TEXT NOT NULL UNIQUE,
 conteudo_hash TEXT NOT NULL,
 obra_id INTEGER REFERENCES obras(id) ON DELETE SET NULL,
 funcionario_id INTEGER REFERENCES funcionarios(id) ON DELETE SET NULL,
 obra_nome TEXT NOT NULL,
 funcionario_nome TEXT NOT NULL,
 criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE IF NOT EXISTS retirada_itens (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 retirada_id INTEGER NOT NULL REFERENCES retiradas(id) ON DELETE CASCADE,
 insumo_id INTEGER REFERENCES insumos(id) ON DELETE SET NULL,
 codigo TEXT NOT NULL,
 nome TEXT NOT NULL,
 especificacao TEXT NOT NULL,
 unidade TEXT NOT NULL,
 quantidade_milesimos INTEGER NOT NULL CHECK(quantidade_milesimos > 0)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_itens_retirada ON retirada_itens(retirada_id);
CREATE INDEX IF NOT EXISTS idx_itens_insumo ON retirada_itens(insumo_id);
CREATE INDEX IF NOT EXISTS idx_retirada_obra ON retiradas(obra_id);
CREATE INDEX IF NOT EXISTS idx_retirada_funcionario ON retiradas(funcionario_id);
PRAGMA user_version = 1;
