import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {HttpError} from './database.mjs';
const assets=new Map([['/',['index.html','text/html; charset=utf-8']],['/index.html',['index.html','text/html; charset=utf-8']],['/styles.css',['styles.css','text/css; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/logo-mova.png',['logo-mova.png','image/png']]]);
const tokenHash=value=>createHash('sha256').update(value).digest('hex');
const SESSION_MS=8*60*60*1000;
async function bodyOf(req){let data='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>32768)throw new HttpError(413,'Solicitação muito grande.');data+=chunk;}try{const result=JSON.parse(data||'{}');if(!result||typeof result!=='object'||Array.isArray(result))throw Error();return result;}catch{throw new HttpError(400,'Dados inválidos.');}}
export function createApp(store){
 const sessions=new Map(),attempts=new Map();
 const sessionOf=req=>{const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('mova_session='));if(!cookie)return null;const key=tokenHash(cookie.slice(13)),session=sessions.get(key);if(!session||session.until<Date.now()){sessions.delete(key);return null;}return{...session,key};};
 const requireAdmin=req=>{if(!sessionOf(req))throw new HttpError(401,'Entre no Admin para continuar.');};
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
 return http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  try{
   const url=new URL(req.url,'http://localhost');const path=url.pathname,method=req.method;
   if(path.startsWith('/api/')){
    if(!['GET','POST','PUT','DELETE'].includes(method))throw new HttpError(405,'Método não permitido.');
    if(method!=='GET'){
     if(req.headers['x-mova-client']!=='1'||!req.headers['content-type']?.startsWith('application/json'))throw new HttpError(403,'Solicitação não autorizada.');
     if(req.headers['sec-fetch-site']==='cross-site')throw new HttpError(403,'Origem não permitida.');
     if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin);}catch{throw new HttpError(403,'Origem inválida.');}if(origin.host!==req.headers.host)throw new HttpError(403,'Origem não permitida.');}
    }
    if(path==='/api/catalogo'&&method==='GET')return json(res,200,{products:store.list('insumos'),people:store.list('funcionarios'),works:store.list('obras')});
    if(path==='/api/session'&&method==='GET')return json(res,200,{admin:!!sessionOf(req)});
    if(path==='/api/login'&&method==='POST'){
     const ip=req.socket.remoteAddress,now=Date.now();
     for(const [key,value] of attempts)if(value.until<now)attempts.delete(key);
     for(const [key,value] of sessions)if(value.until<now)sessions.delete(key);
     const attempt=attempts.get(ip)||{count:0,until:now+15*60*1000};if(attempt.count>=10)throw new HttpError(429,'Muitas tentativas. Aguarde 15 minutos.');
     const body=await bodyOf(req);if(!store.authenticate(body.username,body.password)){attempt.count++;attempts.set(ip,attempt);throw new HttpError(401,'Usuário ou senha incorretos.');}
     attempts.delete(ip);const prior=sessionOf(req);if(prior)sessions.delete(prior.key);const token=randomBytes(32).toString('hex');sessions.set(tokenHash(token),{until:now+SESSION_MS});
     res.setHeader('Set-Cookie',`mova_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS/1000}${req.socket.encrypted?'; Secure':''}`);return json(res,200,{admin:true});
    }
    if(path==='/api/logout'&&method==='POST'){const session=sessionOf(req);if(session)sessions.delete(session.key);res.setHeader('Set-Cookie','mova_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{admin:false});}
    if(path==='/api/retiradas'&&method==='GET'){requireAdmin(req);return json(res,200,store.history());}
    if(path==='/api/retiradas'&&method==='POST')return json(res,201,store.withdraw(await bodyOf(req)));
    const route=path.match(/^\/api\/(insumos|funcionarios|obras)(?:\/([A-Z]+\d+))?$/);
    if(route){requireAdmin(req);const [,type,id]=route;if(method==='GET'&&!id)return json(res,200,store.list(type));if(method==='POST'&&!id)return json(res,201,store.save(type,await bodyOf(req)));if(method==='PUT'&&id)return json(res,200,store.save(type,await bodyOf(req),id));if(method==='DELETE'&&id){const body=await bodyOf(req);store.remove(type,id,body.version);return json(res,200,{deleted:true});}}
    throw new HttpError(404,'Rota não encontrada.');
   }
   const asset=assets.get(path);if(!asset||!['GET','HEAD'].includes(method))throw new HttpError(404,'Não encontrado.');
   const data=await readFile(new URL(`./dist/${asset[0]}`,import.meta.url));res.writeHead(200,{'Content-Type':asset[1]});res.end(method==='HEAD'?undefined:data);
  }catch(error){if(!error.status)console.error(error);if(!res.headersSent)json(res,error.status||500,{error:error.status?error.message:'Não foi possível concluir a operação. Tente novamente.'});else res.end();}
 });
}
