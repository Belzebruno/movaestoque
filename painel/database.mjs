import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes, scryptSync, timingSafeEqual, createHash} from 'node:crypto';

export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new HttpError(status,message);};
const types={insumos:{prefix:'INS'},funcionarios:{prefix:'FUN'},obras:{prefix:'OBR'}};
const categories=['Fixação','Adesivos','Elétrica','Hidráulica','Proteção','Outros'];
const units=['un','caixa','tubo','rolo','m','kg','L','par'];
const fractional=unit=>['m','kg','L'].includes(unit);
const code=(type,id)=>types[type].prefix+String(id).padStart(3,'0');
function idOf(type,value){const match=String(value).match(new RegExp(`^${types[type].prefix}(\\d+)$`));if(!match||!Number.isSafeInteger(Number(match[1]))||Number(match[1])<1)fail(400,'Código inválido.');return Number(match[1]);}
function text(value,max,required=true){if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))fail(400,'Preencha os campos corretamente.');return value.trim();}
function amount(value,unit,allowZero=true){if(typeof value!=='number'||!Number.isFinite(value)||value<0||(!allowZero&&value===0)||value>999999999||Math.abs(value*1000-Math.round(value*1000))>0.0001||(!fractional(unit)&&!Number.isInteger(value)))fail(400,'Quantidade inválida para a unidade. Use até 3 casas decimais para kg, m ou L.');return Math.round(value*1000);}
function publicRow(type,row){if(!row)return null;return{id:code(type,row.id),name:row.nome,version:row.versao,...(type==='insumos'?{detail:row.especificacao,category:row.categoria,unit:row.unidade,stock:row.saldo_milesimos/1000}:{})};}

export function openDatabase(filename=process.env.MOVA_DB_PATH||fileURLToPath(new URL('./data/estoque.sqlite',import.meta.url))){
 if(filename!==':memory:')mkdirSync(dirname(filename),{recursive:true});
 const db=new DatabaseSync(filename,{timeout:5000});
 db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
 const version=db.prepare('PRAGMA user_version').get().user_version;
 if(version>1)throw Error('Versão do banco mais recente que este aplicativo.');
 db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
 if(!db.prepare('SELECT usuario FROM administradores WHERE usuario=?').get('admin')){
   const salt=randomBytes(32).toString('hex');
   const password=process.env.MOVA_ADMIN_PASSWORD||'12345';
   db.prepare('INSERT INTO administradores(usuario,salt,senha_hash) VALUES (?,?,?)').run('admin',salt,scryptSync(password,salt,64).toString('hex'));
 }
 const api={
  db,filename,
  authenticate(username,password){if(typeof username!=='string'||typeof password!=='string'||password.length>256)return false;const row=db.prepare('SELECT * FROM administradores WHERE usuario=?').get(username);if(!row)return false;return timingSafeEqual(scryptSync(password,row.salt,64),Buffer.from(row.senha_hash,'hex'));},
  list(type){if(!types[type])fail(404,'Tabela não encontrada.');return db.prepare(`SELECT * FROM ${type} ORDER BY nome COLLATE NOCASE,id`).all().map(r=>publicRow(type,r));},
  get(type,id){if(!types[type])fail(404,'Tabela não encontrada.');return publicRow(type,db.prepare(`SELECT * FROM ${type} WHERE id=?`).get(idOf(type,id)));},
  save(type,body,id=null){
   if(!types[type])fail(404,'Tabela não encontrada.');
   if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Cadastro inválido.');
   const name=text(body.name,80);let detail,category,unit,stock;
   if(type==='insumos'){detail=text(body.detail??'',100,false);category=body.category;unit=body.unit;if(!categories.includes(category)||!units.includes(unit))fail(400,'Categoria ou unidade inválida.');stock=amount(body.stock,unit);}
   let result;
   if(id){
    const current=api.get(type,id);if(!current)fail(404,'Cadastro não encontrado. Atualize a página.');
    if(body.version!==current.version)fail(409,'Este cadastro mudou em outro dispositivo. Atualize a lista e tente novamente.');
    if(type==='insumos'&&unit!==current.unit&&db.prepare('SELECT 1 FROM retirada_itens WHERE insumo_id=? LIMIT 1').get(idOf(type,id)))fail(409,'Este insumo já tem retiradas. Cadastre outro insumo para usar uma unidade diferente.');
    const update=type==='insumos'?'nome=?, especificacao=?, categoria=?, unidade=?, saldo_milesimos=?':'nome=?';
    const values=type==='insumos'?[name,detail,category,unit,stock]:[name];
    result=db.prepare(`UPDATE ${type} SET ${update},versao=versao+1,atualizado_em=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND versao=?`).run(...values,idOf(type,id),body.version);
    if(!result.changes)fail(409,'Cadastro alterado. Atualize a lista.');return api.get(type,id);
   }
   result=type==='insumos'?db.prepare('INSERT INTO insumos(nome,especificacao,categoria,unidade,saldo_milesimos) VALUES (?,?,?,?,?)').run(name,detail,category,unit,stock):db.prepare(`INSERT INTO ${type}(nome) VALUES (?)`).run(name);
   return api.get(type,code(type,Number(result.lastInsertRowid)));
  },
  remove(type,id,version){
   if(!types[type])fail(404,'Tabela não encontrada.');
   const current=api.get(type,id);if(!current)fail(404,'Cadastro já removido.');
   if(version!==current.version)fail(409,'O cadastro mudou. Atualize antes de excluir.');
   const result=db.prepare(`DELETE FROM ${type} WHERE id=? AND versao=?`).run(idOf(type,id),version);
   if(!result.changes)fail(409,'O cadastro mudou. Atualize antes de excluir.');
  },
  record(id){const row=db.prepare('SELECT * FROM retiradas WHERE id=?').get(id);if(!row)return null;const items=db.prepare('SELECT * FROM retirada_itens WHERE retirada_id=? ORDER BY id').all(id);return{id:'RET-'+String(row.id).padStart(3,'0'),date:row.criado_em,work:row.obra_nome,person:row.funcionario_nome,items:items.map(p=>({id:p.codigo,name:p.nome,detail:p.especificacao,unit:p.unidade,quantity:p.quantidade_milesimos/1000}))};},
  history(){return db.prepare('SELECT id FROM retiradas ORDER BY id DESC').all().map(r=>api.record(r.id));},
  withdraw(body){
   if(!body||typeof body!=='object'||!Array.isArray(body.items)||body.items.length<1||body.items.length>100)fail(400,'Selecione de 1 a 100 insumos.');
   if(typeof body.requestId!=='string'||! /^[a-zA-Z0-9-]{20,80}$/.test(body.requestId))fail(400,'Identificador de retirada inválido.');
   const workId=idOf('obras',body.workId),personId=idOf('funcionarios',body.personId);
   const items=body.items.map(i=>{if(!i||typeof i!=='object'||!units.includes(i.unit)||typeof i.quantity!=='number')fail(400,'Insumo inválido.');return{id:idOf('insumos',i.id),quantity:i.quantity,unit:i.unit};}).sort((a,b)=>a.id-b.id);
   if(new Set(items.map(i=>i.id)).size!==items.length)fail(400,'Um insumo aparece mais de uma vez.');
   const hash=createHash('sha256').update(JSON.stringify({workId,personId,items})).digest('hex');
   db.exec('BEGIN IMMEDIATE');
   try{
    const old=db.prepare('SELECT id,conteudo_hash FROM retiradas WHERE chave_requisicao=?').get(body.requestId);
    if(old){if(old.conteudo_hash!==hash)fail(409,'Esta confirmação já foi usada para outra retirada.');const saved=api.record(old.id);db.exec('COMMIT');return saved;}
    const work=db.prepare('SELECT nome FROM obras WHERE id=?').get(workId),person=db.prepare('SELECT nome FROM funcionarios WHERE id=?').get(personId);
    if(!work||!person)fail(409,'Obra ou funcionário removido. Atualize e selecione novamente.');
    const validated=items.map(i=>{const p=db.prepare('SELECT * FROM insumos WHERE id=?').get(i.id);if(!p)fail(409,'Um insumo foi removido. Atualize a lista.');if(p.unidade!==i.unit)fail(409,'A unidade de um insumo mudou. Atualize a lista.');const quantity=amount(i.quantity,p.unidade,false);if(quantity>p.saldo_milesimos)fail(409,`Estoque insuficiente: ${p.nome}. Disponível: ${p.saldo_milesimos/1000} ${p.unidade}.`);return{...p,quantity};});
    const result=db.prepare('INSERT INTO retiradas(chave_requisicao,conteudo_hash,obra_id,funcionario_id,obra_nome,funcionario_nome) VALUES (?,?,?,?,?,?)').run(body.requestId,hash,workId,personId,work.nome,person.nome);
    const id=Number(result.lastInsertRowid);
    for(const p of validated){db.prepare("UPDATE insumos SET saldo_milesimos=saldo_milesimos-?,versao=versao+1,atualizado_em=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(p.quantity,p.id);db.prepare('INSERT INTO retirada_itens(retirada_id,insumo_id,codigo,nome,especificacao,unidade,quantidade_milesimos) VALUES (?,?,?,?,?,?,?)').run(id,p.id,code('insumos',p.id),p.nome,p.especificacao,p.unidade,p.quantity);}
    const saved=api.record(id);db.exec('COMMIT');return saved;
   }catch(error){db.exec('ROLLBACK');throw error;}
  },
  close(){db.close();}
 };
 return api;
}
