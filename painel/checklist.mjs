import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {fail,idOf,text} from './validation.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const fields=['projeto','conferencia','fita','exportacao'];
export function checklistStore(query){
 return {
  async seed(password){const salt=randomBytes(32).toString('hex');await query('INSERT INTO checklist_conta(usuario,salt,senha_hash) VALUES (?,?,?) ON CONFLICT(usuario) DO NOTHING',['belzebruno',salt,scryptSync(password,salt,64).toString('hex')]);},
  async login(username,password,ip){
   const now=Date.now(),key=hash(String(ip));
   await query('DELETE FROM checklist_tentativas WHERE ate<?',[now]);
   const {rows:[attempt]}=await query('INSERT INTO checklist_tentativas(chave,total,ate) VALUES (?,1,?) ON CONFLICT(chave) DO UPDATE SET total=checklist_tentativas.total+1 RETURNING total',[key,now+900000]);
   if(attempt.total>10)fail(429,'Muitas tentativas. Aguarde 15 minutos.');
   if(username!=='belzebruno'||typeof password!=='string'||password.length>256)fail(401,'Usuário ou senha incorretos.');
   const {rows:[row]}=await query('SELECT salt,senha_hash FROM checklist_conta WHERE usuario=?',[username]);
   if(!row||!timingSafeEqual(scryptSync(password,row.salt,64),Buffer.from(row.senha_hash,'hex')))fail(401,'Usuário ou senha incorretos.');
   const token=randomBytes(32).toString('hex');await query('DELETE FROM checklist_sessoes WHERE ate<?',[now]);
   await query('INSERT INTO checklist_sessoes(token_hash,ate) VALUES (?,?)',[hash(token),now+28800000]);
   await query('DELETE FROM checklist_tentativas WHERE chave=?',[key]);return token;
  },
  async session(token){if(!token)return false;const {rows}=await query('SELECT token_hash FROM checklist_sessoes WHERE token_hash=? AND ate>?',[hash(token),Date.now()]);return !!rows.length;},
  async logout(token){if(token)await query('DELETE FROM checklist_sessoes WHERE token_hash=?',[hash(token)]);},
  async list(work){const workId=idOf('obras',work);const {rows:works}=await query('SELECT id FROM obras WHERE id=?',[workId]);if(!works.length)fail(404,'Obra não encontrada.');const {rows}=await query('SELECT id,nome,projeto,conferencia,fita,exportacao,versao FROM checklist_ambientes WHERE obra_id=? ORDER BY id',[workId]);return rows.map(row=>({...row,...Object.fromEntries(fields.map(f=>[f,!!row[f]]))}));},
  async save(work,body,id){
   const workId=idOf('obras',work);if(!id){const name=text(body.nome,80);const {rows}=await query('INSERT INTO checklist_ambientes(obra_id,nome) SELECT id,? FROM obras WHERE id=? RETURNING id',[name,workId]);if(!rows.length)fail(404,'Obra não encontrada.');return;}
   if(!Number.isSafeInteger(Number(id))||Number(id)<1)fail(400,'Ambiente inválido.');
   const keys=Object.keys(body).filter(k=>k!=='versao');if(keys.length!==1||!['nome',...fields].includes(keys[0]))fail(400,'Alteração inválida.');
   const field=keys[0];let value;if(field==='nome')value=text(body.nome,80);else{if(typeof body[field]!=='boolean')fail(400,'Marcação inválida.');value=body[field]?1:0;}
   if(!Number.isSafeInteger(body.versao)||body.versao<1)fail(400,'Versão inválida.');
   const {rows}=await query(`UPDATE checklist_ambientes SET ${field}=?,versao=versao+1 WHERE id=? AND obra_id=? AND versao=? RETURNING id`,[value,Number(id),workId,body.versao]);if(!rows.length)fail(409,'O ambiente mudou em outra aba. Atualize e tente novamente.');
  }
 };
}
export function checklistRoutes(store,bodyOf,json){
 const tokenOf=req=>(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('mova_checklist='))?.slice(15);
 const cookie=(req,token,max)=>`mova_checklist=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${max}${process.env.VERCEL||req.socket.encrypted?'; Secure':''}`;
 return async(req,res,path)=>{
  const token=tokenOf(req),method=req.method;
  if(path==='/api/checklist/login'&&method==='POST'){const b=await bodyOf(req);const fresh=await store.checklist.login(b.username,b.password,process.env.VERCEL?req.headers['x-vercel-forwarded-for']||req.socket.remoteAddress:req.socket.remoteAddress);await store.checklist.logout(token);res.setHeader('Set-Cookie',cookie(req,fresh,28800));return json(res,200,{authorized:true});}
  if(path==='/api/checklist/session'&&method==='GET')return json(res,200,{authorized:await store.checklist.session(token)});
  if(!await store.checklist.session(token))fail(401,'Entre com sua conta para acessar o checklist.');
  if(path==='/api/checklist/logout'&&method==='POST'){await store.checklist.logout(token);res.setHeader('Set-Cookie',cookie(req,'',0));return json(res,200,{authorized:false});}
  if(path==='/api/checklist/obras'&&method==='GET')return json(res,200,await store.list('obras'));
  const match=path.match(/^\/api\/checklist\/obras\/(OBR\d+)\/ambientes(?:\/(\d+))?$/);
  if(match){const [,work,id]=match;if(method==='GET'&&!id)return json(res,200,await store.checklist.list(work));if((method==='POST'&&!id)||(method==='PUT'&&id)){await store.checklist.save(work,await bodyOf(req),id);return json(res,method==='POST'?201:200,await store.checklist.list(work));}}
  fail(404,'Rota não encontrada.');
 };
}
