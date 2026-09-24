import {Pool} from 'pg';
import {attachDatabasePool} from '@vercel/functions';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fail,types,categories,units,code,idOf,text,amount,publicRow} from './validation.mjs';

export function openPostgres(connectionString=process.env.DATABASE_URL) {
 if(!connectionString) throw Error('Configure DATABASE_URL no servidor.');
 const pool=new Pool({connectionString,max:5,connectionTimeoutMillis:15000,idleTimeoutMillis:5000});
 if(process.env.VERCEL) attachDatabasePool(pool);
 pool.on('error',error=>console.error('Postgres pool:',error.code));
 const query=(sql,values=[])=>pool.query(sql,values);
 const table=type=>{if(!types[type])fail(404,'Tabela não encontrada.');return type;};
 async function transaction(operation) {
  const client=await pool.connect();
  try {await client.query('BEGIN');const result=await operation(client);await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
 }
 async function record(client,id) {
  const {rows:[row]}=await client.query('SELECT id,criado_em,obra_nome,funcionario_nome FROM retiradas WHERE id=$1',[id]);
  if(!row)return null;
  const {rows:items}=await client.query('SELECT codigo,nome,especificacao,unidade,quantidade_milesimos FROM retirada_itens WHERE retirada_id=$1 ORDER BY id',[id]);
  return {id:'RET-'+String(row.id).padStart(3,'0'),date:row.criado_em,work:row.obra_nome,person:row.funcionario_nome,items:items.map(p=>({id:p.codigo,name:p.nome,detail:p.especificacao,unit:p.unidade,quantity:Number(p.quantidade_milesimos)/1000}))};
 }
 const api={
  pool,
  async migrate(){
   const sql=await readFile(new URL('./schema-postgres.sql',import.meta.url),'utf8');
   await transaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(724091)');
    await client.query(sql);
    const salt=randomBytes(32).toString('hex');
    await client.query('INSERT INTO administradores(usuario,salt,senha_hash) VALUES ($1,$2,$3) ON CONFLICT (usuario) DO NOTHING',['admin',salt,scryptSync(process.env.MOVA_ADMIN_PASSWORD||'12345',salt,64).toString('hex')]);
   });
  },
  async authenticate(username,password){
   if(typeof username!=='string'||typeof password!=='string'||password.length>256)return false;
   const {rows:[row]}=await query('SELECT salt,senha_hash FROM administradores WHERE usuario=$1',[username]);
   return !!row&&timingSafeEqual(scryptSync(password,row.salt,64),Buffer.from(row.senha_hash,'hex'));
  },
  async sessionGet(key){const {rows:[row]}=await query('SELECT expira_em FROM sessoes_admin WHERE token_hash=$1 AND expira_em>now()',[key]);return row?{until:new Date(row.expira_em).getTime()}:null;},
  async sessionSet(key,until){await query('DELETE FROM sessoes_admin WHERE expira_em<now()');await query('INSERT INTO sessoes_admin(token_hash,expira_em) VALUES ($1,$2)',[key,new Date(until)]);},
  async sessionDelete(key){await query('DELETE FROM sessoes_admin WHERE token_hash=$1',[key]);},
  async loginAttempt(ip){
   const key=createHash('sha256').update(ip||'unknown').digest('hex');
   await query('DELETE FROM tentativas_login WHERE expira_em<now()');
   const {rows:[row]}=await query(`INSERT INTO tentativas_login(chave,total,expira_em) VALUES ($1,1,now()+interval '15 minutes') ON CONFLICT(chave) DO UPDATE SET total=tentativas_login.total+1 RETURNING total`,[key]);
   if(row.total>10)fail(429,'Muitas tentativas. Aguarde 15 minutos.');
   return key;
  },
  async loginSuccess(key){await query('DELETE FROM tentativas_login WHERE chave=$1',[key]);},
  async list(type){const {rows}=await query(`SELECT * FROM ${table(type)} ORDER BY lower(nome),id`);return rows.map(row=>publicRow(type,row));},
  async get(type,id){const {rows:[row]}=await query(`SELECT * FROM ${table(type)} WHERE id=$1`,[idOf(type,id)]);return publicRow(type,row);},
  async save(type,body,id=null){
   table(type);
   if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Cadastro inválido.');
   const name=text(body.name,80);let detail,category,unit,stock;
   if(type==='insumos'){detail=text(body.detail??'',100,false);category=body.category;unit=body.unit;if(!categories.includes(category)||!units.includes(unit))fail(400,'Categoria ou unidade inválida.');stock=amount(body.stock,unit);}
   return transaction(async client=>{
    let row;
    if(id){
     const numeric=idOf(type,id);
     const {rows:[current]}=await client.query(`SELECT * FROM ${type} WHERE id=$1 FOR UPDATE`,[numeric]);
     if(!current)fail(404,'Cadastro não encontrado. Atualize a página.');
     if(body.version!==current.versao)fail(409,'Este cadastro mudou. Atualize a lista.');
     if(type==='insumos'&&unit!==current.unidade){const used=await client.query('SELECT 1 FROM retirada_itens WHERE insumo_id=$1 LIMIT 1',[numeric]);if(used.rowCount)fail(409,'Este insumo já tem retiradas. Cadastre outro para mudar a unidade.');}
     const values=type==='insumos'?[name,detail,category,unit,stock,numeric]:[name,numeric];
     const fields=type==='insumos'?'nome=$1,especificacao=$2,categoria=$3,unidade=$4,saldo_milesimos=$5':'nome=$1';
     ({rows:[row]}=await client.query(`UPDATE ${type} SET ${fields},versao=versao+1,atualizado_em=now() WHERE id=$${values.length} RETURNING *`,values));
    }else{
     const fields=type==='insumos'?'nome,especificacao,categoria,unidade,saldo_milesimos':'nome';
     const values=type==='insumos'?[name,detail,category,unit,stock]:[name];
     ({rows:[row]}=await client.query(`INSERT INTO ${type}(${fields}) VALUES (${values.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,values));
    }
    return publicRow(type,row);
   });
  },
  async remove(type,id,version){
   table(type);if(!Number.isInteger(version))fail(400,'Versão inválida.');
   const result=await query(`DELETE FROM ${type} WHERE id=$1 AND versao=$2`,[idOf(type,id),version]);
   if(!result.rowCount)fail(409,'O cadastro mudou ou já foi removido. Atualize a lista.');
  },
  record:id=>record(pool,id),
  async history(){
   const {rows}=await query(`SELECT r.id,r.criado_em,r.obra_nome,r.funcionario_nome,
    COALESCE(json_agg(json_build_object('id',i.codigo,'name',i.nome,'detail',i.especificacao,'unit',i.unidade,'quantity',i.quantidade_milesimos/1000.0) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL),'[]') AS items
    FROM retiradas r LEFT JOIN retirada_itens i ON i.retirada_id=r.id GROUP BY r.id ORDER BY r.id DESC`);
   return rows.map(r=>({id:'RET-'+String(r.id).padStart(3,'0'),date:r.criado_em,work:r.obra_nome,person:r.funcionario_nome,items:r.items}));
  },
  async withdraw(body){
   if(!body||typeof body!=='object'||!Array.isArray(body.items)||body.items.length<1||body.items.length>100)fail(400,'Selecione de 1 a 100 insumos.');
   if(typeof body.requestId!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(body.requestId))fail(400,'Identificador de retirada inválido.');
   const workId=idOf('obras',body.workId),personId=idOf('funcionarios',body.personId);
   const items=body.items.map(i=>{if(!i||typeof i!=='object'||!units.includes(i.unit)||typeof i.quantity!=='number')fail(400,'Insumo inválido.');return{id:idOf('insumos',i.id),quantity:i.quantity,unit:i.unit};}).sort((a,b)=>a.id-b.id);
   if(new Set(items.map(i=>i.id)).size!==items.length)fail(400,'Um insumo aparece mais de uma vez.');
   const hash=createHash('sha256').update(JSON.stringify({workId,personId,items})).digest('hex');
   return transaction(async client=>{
    // Serialize retries with the same key, then lock products in stable ID order.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[body.requestId]);
    const {rows:[old]}=await client.query('SELECT id,conteudo_hash FROM retiradas WHERE chave_requisicao=$1',[body.requestId]);
    if(old){if(old.conteudo_hash!==hash)fail(409,'Esta confirmação já foi usada para outra retirada.');return record(client,old.id);}
    const {rows:[work]}=await client.query('SELECT nome FROM obras WHERE id=$1 FOR SHARE',[workId]);
    const {rows:[person]}=await client.query('SELECT nome FROM funcionarios WHERE id=$1 FOR SHARE',[personId]);
    if(!work||!person)fail(409,'Obra ou funcionário removido. Atualize a lista.');
    const validated=[];
    for(const i of items){
     const {rows:[p]}=await client.query('SELECT * FROM insumos WHERE id=$1 FOR UPDATE',[i.id]);
     if(!p)fail(409,'Um insumo foi removido. Atualize a lista.');
     if(p.unidade!==i.unit)fail(409,'A unidade mudou. Atualize a lista.');
     const quantity=amount(i.quantity,p.unidade,false);
     if(quantity>Number(p.saldo_milesimos))fail(409,`Estoque insuficiente: ${p.nome}. Disponível: ${p.saldo_milesimos/1000} ${p.unidade}.`);
     validated.push({...p,quantity});
    }
    const {rows:[saved]}=await client.query('INSERT INTO retiradas(chave_requisicao,conteudo_hash,obra_id,funcionario_id,obra_nome,funcionario_nome) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',[body.requestId,hash,workId,personId,work.nome,person.nome]);
    for(const p of validated){
     await client.query('UPDATE insumos SET saldo_milesimos=saldo_milesimos-$1,versao=versao+1,atualizado_em=now() WHERE id=$2',[p.quantity,p.id]);
     await client.query('INSERT INTO retirada_itens(retirada_id,insumo_id,codigo,nome,especificacao,unidade,quantidade_milesimos) VALUES ($1,$2,$3,$4,$5,$6,$7)',[saved.id,p.id,code('insumos',p.id),p.nome,p.especificacao,p.unidade,p.quantity]);
    }
    return record(client,saved.id);
   });
  },
  close:()=>pool.end()
 };
 return api;
}
