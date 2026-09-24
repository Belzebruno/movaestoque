import {openPostgres} from '../painel/postgres.mjs';
import {createHandler} from '../painel/http-app.mjs';
let handler;
export default async function(req,res){
 if(!process.env.DATABASE_URL){res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({error:'Configure DATABASE_URL no ambiente da Vercel e faça um novo deploy.'}));}
 handler??=createHandler(openPostgres());
 return handler(req,res);
}
