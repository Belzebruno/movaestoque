import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {HttpError} from './validation.mjs';
const assets=new Map([['/',['index.html','text/html; charset=utf-8']],['/index.html',['index.html','text/html; charset=utf-8']],['/styles.css',['styles.css','text/css; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/logo-mova.png',['logo-mova.png','image/png']]]);
const tokenHash=value=>createHash('sha256').update(value).digest('hex');
const SESSION_MS=8*60*60*1000;
async function bodyOf(req){
 let data=req.body;
 if(data===undefined){data='';let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>32768)throw new HttpError(413,'Solicitação muito grande.');data+=chunk;}}
 try {if(typeof data==='string')data=JSON.parse(data||'{}');}catch{throw new HttpError(400,'Dados inválidos.');}
 if(!data||typeof data!=='object'||Array.isArray(data))throw new HttpError(400,'Dados inválidos.');
 if(Buffer.byteLength(JSON.stringify(data))>32768)throw new HttpError(413,'Solicitação muito grande.');
 return data;
}
export function createHandler(store){
 const sessions=new Map(),attempts=new Map();
 const sessionGet=async key=>store.sessionGet?store.sessionGet(key):sessions.get(key);
 const sessionSet=async(key,until)=>store.sessionSet?store.sessionSet(key,until):sessions.set(key,{until});
 const sessionDelete=async key=>store.sessionDelete?store.sessionDelete(key):sessions.delete(key);
 const sessionOf=async req=>{const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('mova_session='));if(!cookie)return null;const key=tokenHash(cookie.slice(13)),session=await sessionGet(key);if(!session||session.until<Date.now()){if(session)await sessionDelete(key);return null;}return{...session,key};};
 const requireAdmin=async req=>{if(!await sessionOf(req))throw new HttpError(401,'Entre no Admin para continuar.');};
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
 return async(req,res)=>{
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
    if(path==='/api/catalogo'&&method==='GET')return json(res,200,{products:await store.list('insumos'),people:await store.list('funcionarios'),works:await store.list('obras')});
    if(path==='/api/session'&&method==='GET')return json(res,200,{admin:!!(await sessionOf(req))});
    if(path==='/api/login'&&method==='POST'){
     const ip=process.env.VERCEL?String(req.headers['x-vercel-forwarded-for']||req.socket.remoteAddress):req.socket.remoteAddress,now=Date.now();
     const attemptKey=store.loginAttempt?await store.loginAttempt(ip):null;
     for(const [key,value] of attempts)if(value.until<now)attempts.delete(key);
     for(const [key,value] of sessions)if(value.until<now)sessions.delete(key);
     const attempt=attempts.get(ip)||{count:0,until:now+15*60*1000};if(attempt.count>=10)throw new HttpError(429,'Muitas tentativas. Aguarde 15 minutos.');
     const body=await bodyOf(req);if(!await store.authenticate(body.username,body.password)){attempt.count++;attempts.set(ip,attempt);throw new HttpError(401,'Usuário ou senha incorretos.');}
     attempts.delete(ip);if(attemptKey)await store.loginSuccess(attemptKey);const prior=await sessionOf(req);if(prior)await sessionDelete(prior.key);const token=randomBytes(32).toString('hex');await sessionSet(tokenHash(token),now+SESSION_MS);
     res.setHeader('Set-Cookie',`mova_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS/1000}${(process.env.VERCEL||req.socket.encrypted)?'; Secure':''}`);return json(res,200,{admin:true});
    }
    if(path==='/api/logout'&&method==='POST'){const session=await sessionOf(req);if(session)await sessionDelete(session.key);res.setHeader('Set-Cookie','mova_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{admin:false});}
    if(path==='/api/retiradas'&&method==='GET'){await requireAdmin(req);return json(res,200,await store.history());}
    if(path==='/api/retiradas'&&method==='POST')return json(res,201,await store.withdraw(await bodyOf(req)));
    const route=path.match(/^\/api\/(insumos|funcionarios|obras)(?:\/([A-Z]+\d+))?$/);
    if(route){await requireAdmin(req);const [,type,id]=route;if(method==='GET'&&!id)return json(res,200,await store.list(type));if(method==='POST'&&!id)return json(res,201,await store.save(type,await bodyOf(req)));if(method==='PUT'&&id)return json(res,200,await store.save(type,await bodyOf(req),id));if(method==='DELETE'&&id){const body=await bodyOf(req);await store.remove(type,id,body.version);return json(res,200,{deleted:true});}}
    throw new HttpError(404,'Rota não encontrada.');
   }
   const asset=assets.get(path);if(!asset||!['GET','HEAD'].includes(method))throw new HttpError(404,'Não encontrado.');
   const data=await readFile(new URL(`./dist/${asset[0]}`,import.meta.url));res.writeHead(200,{'Content-Type':asset[1]});res.end(method==='HEAD'?undefined:data);
  }catch(error){if(!error.status)console.error(error);if(!res.headersSent)json(res,error.status||500,{error:error.status?error.message:'Não foi possível concluir a operação. Tente novamente.'});else res.end();}
  };
}
export function createApp(store){return http.createServer(createHandler(store));}
