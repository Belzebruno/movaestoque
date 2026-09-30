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
 obra_id INTEGER REFERENCES obras(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS funcionario_pins (
 funcionario_id INTEGER PRIMARY KEY REFERENCES funcionarios(id) ON DELETE CASCADE,
 salt TEXT NOT NULL,
 pin_hash TEXT NOT NULL,
 tentativas INTEGER NOT NULL DEFAULT 0,
 bloqueado_ate BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS checklist_conta (usuario TEXT PRIMARY KEY, salt TEXT NOT NULL, senha_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS checklist_sessoes (token_hash TEXT PRIMARY KEY, ate BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS checklist_tentativas (chave TEXT PRIMARY KEY, total INTEGER NOT NULL, ate BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS checklist_ambientes (
 id INTEGER PRIMARY KEY,
 obra_id INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
 nome TEXT NOT NULL CHECK(length(trim(nome)) BETWEEN 1 AND 80),
 projeto INTEGER NOT NULL DEFAULT 0 CHECK(projeto IN (0,1)),
 conferencia INTEGER NOT NULL DEFAULT 0 CHECK(conferencia IN (0,1)),
 fita INTEGER NOT NULL DEFAULT 0 CHECK(fita IN (0,1)),
 exportacao INTEGER NOT NULL DEFAULT 0 CHECK(exportacao IN (0,1)),
 corte INTEGER NOT NULL DEFAULT 0 CHECK(corte IN (0,1)),
 producao INTEGER NOT NULL DEFAULT 0 CHECK(producao IN (0,1)),
 obra INTEGER NOT NULL DEFAULT 0 CHECK(obra IN (0,1)),
 versao INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_checklist_obra ON checklist_ambientes(obra_id);

-- Atualiza também bancos SQLite criados antes da exclusão em cascata.
CREATE TRIGGER IF NOT EXISTS excluir_retiradas_da_obra
BEFORE DELETE ON obras FOR EACH ROW
BEGIN
 DELETE FROM retiradas WHERE obra_id=OLD.id;
END;
