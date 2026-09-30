import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../database.mjs';
import {openPostgres} from '../postgres.mjs';
import {createApp} from '../http-app.mjs';
import {randomUUID} from 'node:crypto';
for(const engine of ['sqlite','postgres'])test('Checklist privado: '+engine,{skip:engine==='postgres'&&!process.env.MOVA_TEST_DATABASE_URL},async t=>{
 let store,cleanup=async()=>{};
 if(engine==='sqlite')store=openDatabase(':memory:');else{
  const root=openPostgres(process.env.MOVA_TEST_DATABASE_URL),schema='test_checklist_'+randomUUID().replaceAll('-','');await root.pool.query('CREATE SCHEMA '+schema);const url=new URL(process.env.MOVA_TEST_DATABASE_URL);url.searchParams.set('options','-c search_path='+schema);store=openPostgres(url.toString());await store.migrate();cleanup=async()=>{await root.pool.query('DROP SCHEMA '+schema+' CASCADE');await root.close();};
 }
 await store.checklist.seed('test-only-password');const work=await store.save('obras',{name:'Obra de teste'}),other=await store.save('obras',{name:'Outra obra'});
 const server=createApp(store);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await store.close();await cleanup();});const base='http://127.0.0.1:'+server.address().port;
 async function req(path,method='GET',body,cookie=''){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Mova-Client':'1',cookie},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.getSetCookie().filter(c=>!c.includes('Max-Age=0')).map(c=>c.split(';')[0]).join('; ')};}
 const route='/api/checklist/obras/'+work.id+'/ambientes';
 assert.equal((await req(route)).status,401);assert.equal((await req(route,'POST',{nome:'Intruso'})).status,401);assert.equal((await req(route+'/1','PUT',{nome:'Intruso',versao:1})).status,401);
 const admin=await req('/api/login','POST',{username:'admin',password:'12345'});assert.equal((await req(route,'GET',null,admin.cookie)).status,401);
 assert.equal((await req('/api/checklist/login','POST',{username:'admin',password:'12345'})).status,401);
 const login=await req('/api/checklist/login','POST',{username:'belzebruno',password:'test-only-password'});assert.equal(login.status,200);const cookie=login.cookie;
 assert.equal((await req('/api/checklist/session','GET',null,cookie)).data.authorized,true);
 assert.equal((await req('/api/obras','GET',null,cookie)).status,401);
 let response=await req(route,'POST',{nome:'Cozinha'},cookie);assert.equal(response.status,201);let row=response.data[0];assert.equal(row.nome,'Cozinha');assert.equal(row.projeto,false);
 for(const field of ['projeto','conferencia','fita','exportacao','corte','producao','obra']){response=await req(route+'/'+row.id,'PUT',{[field]:true,versao:row.versao},cookie);assert.equal(response.status,200);row=response.data[0];assert.equal(row[field],true);}
 response=await req(route+'/'+row.id,'PUT',{nome:'Cozinha gourmet',versao:row.versao},cookie);assert.equal(response.status,200);row=response.data[0];assert.equal(row.nome,'Cozinha gourmet');
 assert.equal((await req(route+'/'+row.id,'PUT',{projeto:false,versao:1},cookie)).status,409);
 assert.equal((await req(route+'/'+row.id,'PUT',{projeto:'true',versao:row.versao},cookie)).status,400);
 assert.equal((await req('/api/checklist/obras/'+other.id+'/ambientes/'+row.id,'PUT',{projeto:false,versao:row.versao},cookie)).status,409);
 response=await req(route+'/'+row.id,'PUT',{projeto:false,versao:row.versao},cookie);assert.equal(response.data[0].projeto,false);
 assert.equal((await req(route,'GET',null,cookie)).data[0].nome,'Cozinha gourmet');
 await req('/api/checklist/logout','POST',{},cookie);assert.equal((await req(route,'GET',null,cookie)).status,401);
 const personal=await req('/api/login','POST',{username:'belzebruno',password:'test-only-password'});assert.equal(personal.status,200);assert.equal(personal.data.checklist,true);
 assert.equal((await req('/api/session','GET',null,personal.cookie)).data.checklist,true);
 assert.equal((await req(route,'GET',null,personal.cookie)).status,200);
 const switched=await req('/api/login','POST',{username:'admin',password:'12345'},personal.cookie);assert.equal(switched.data.checklist,false);assert.equal((await req(route,'GET',null,personal.cookie)).status,401);
 const again=await req('/api/login','POST',{username:'belzebruno',password:'test-only-password'});await req('/api/logout','POST',{},again.cookie);assert.equal((await req(route,'GET',null,again.cookie)).status,401);
 for(let i=0;i<10;i++)assert.equal((await req('/api/checklist/login','POST',{username:'belzebruno',password:'wrong'})).status,401);
 assert.equal((await req('/api/checklist/login','POST',{username:'belzebruno',password:'test-only-password'})).status,429);
});
