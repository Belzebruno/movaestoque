import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openPostgres} from '../postgres.mjs';
import {createApp} from '../http-app.mjs';

test('Postgres: autenticação compartilhada, CRUD e retiradas atômicas',{skip:!process.env.MOVA_TEST_DATABASE_URL},async t=>{
 assert.notEqual(process.env.MOVA_TEST_DATABASE_URL,process.env.DATABASE_URL,'Use banco de testes separado.');
 const filename=join(mkdtempSync(join(tmpdir(),'mova-test-')),'estoque.sqlite');
 let store,server,base,cookie='';
 async function start(){store=openPostgres(process.env.MOVA_TEST_DATABASE_URL);server=createApp(store);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;}
 async function stop(){await new Promise(resolve=>server.close(resolve));await store.close();}
 await start();t.after(async()=>{if(server.listening)await stop();});
 async function req(path,method='GET',body,authenticated=true,extra={}){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Mova-Client':'1',...(authenticated&&cookie?{Cookie:cookie}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});return{status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};}
 let product,work,person;
 await t.test('Começa vazio e guarda senha derivada, não texto puro',async()=>{
  assert.deepEqual((await req('/api/catalogo')).data,{products:[],people:[],works:[]});
  const {rows:[admin]}=await store.pool.query('SELECT * FROM administradores');assert.notEqual(admin.senha_hash,'12345');assert.equal(admin.senha_hash.length,128);
  assert(!readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').includes('12345'));
 });
 await t.test('Rejeita criação, edição, exclusão e histórico sem sessão',async()=>{
  for(const path of ['insumos','obras','funcionarios']){
   assert.equal((await req('/api/'+path,'POST',{name:'Intruso'},false)).status,401);
   assert.equal((await req('/api/'+path+'/INS001','PUT',{name:'Intruso'},false)).status,401);
   assert.equal((await req('/api/'+path+'/INS001','DELETE',{},false)).status,401);
  }
  assert.equal((await req('/api/retiradas','GET',undefined,false)).status,401);
  assert.equal((await req('/api/login','POST',{username:'admin',password:'errada'})).status,401);
  const login=await req('/api/login','POST',{username:'admin',password:'12345'});assert.equal(login.status,200);assert.match(login.cookie,/HttpOnly/);assert.match(login.cookie,/SameSite=Strict/);cookie=login.cookie.split(';')[0];
  assert.equal((await req('/api/session')).data.admin,true);
 });
 await t.test('Admin cria as três tabelas e valida dados',async()=>{
  assert.equal((await req('/api/insumos','POST',{name:'Incompleto'})).status,400);
  assert.equal((await req('/api/obras','POST',{name:'   '})).status,400);
  assert.equal((await req('/api/insumos','POST',{name:'Fração inválida',category:'Outros',unit:'un',stock:1.5})).status,400);
  product=(await req('/api/insumos','POST',{name:'Cola',detail:'Teste',category:'Adesivos',unit:'kg',stock:10})).data;
  work=(await req('/api/obras','POST',{name:'Obra teste'})).data;
  person=(await req('/api/funcionarios','POST',{name:'Funcionário teste'})).data;
  assert.equal(product.stock,10);assert.equal(person.name,'Funcionário teste');assert.equal(work.name,'Obra teste');
 });
 await t.test('Admin edita todas as tabelas e impede atualização obsoleta',async()=>{
  const oldProduct={...product};
  product=(await req('/api/insumos/'+product.id,'PUT',{...product,name:'Cola editada',stock:12.5})).data;
  work=(await req('/api/obras/'+work.id,'PUT',{...work,name:'Obra editada'})).data;
  person=(await req('/api/funcionarios/'+person.id,'PUT',{...person,name:'Funcionário editado'})).data;
  assert.equal(product.stock,12.5);assert.equal(work.name,'Obra editada');assert.equal(person.name,'Funcionário editado');
  assert.equal((await req('/api/insumos/'+product.id,'PUT',{...oldProduct,stock:100})).status,409);
  assert.equal((await req('/api/insumos/'+product.id,'DELETE',{version:oldProduct.version})).status,409);
  assert.equal((await req('/api/obras','POST',{name:'CSRF'},true,{Origin:'https://evil.example'})).status,403);
  assert.equal((await req('/api/obras','POST',{name:'CSRF'},true,{'X-Mova-Client':''})).status,403);
 });
 await t.test('Persiste após reiniciar e mantém a sessão compartilhada',async()=>{
  await stop();await start();assert.equal((await req('/api/session')).data.admin,true);
  const catalog=(await req('/api/catalogo')).data;assert.equal(catalog.products[0].stock,12.5);assert.equal(catalog.people[0].name,'Funcionário editado');assert.equal(catalog.works[0].name,'Obra editada');
  cookie=(await req('/api/login','POST',{username:'admin',password:'12345'})).cookie.split(';')[0];
 });
 await t.test('Retirada persiste, reduz saldo e não duplica ao reenviar',async()=>{
  const payload={requestId:randomUUID(),workId:work.id,personId:person.id,items:[{id:product.id,unit:'kg',quantity:2.25}]};
  const first=await req('/api/retiradas','POST',payload,false);assert.equal(first.status,201);assert.equal(first.data.items[0].quantity,2.25);
  const parallel=await Promise.all([req('/api/retiradas','POST',payload,false),req('/api/retiradas','POST',payload,false)]);assert.equal(parallel[0].data.id,first.data.id);assert.equal(parallel[1].data.id,first.data.id);const retry=parallel[0];assert.equal(retry.data.id,first.data.id);assert.equal((await req('/api/catalogo')).data.products[0].stock,10.25);
  assert.equal((await req('/api/retiradas','POST',{...payload,items:[{id:product.id,unit:'kg',quantity:1}]},false)).status,409);
  const negative=await req('/api/retiradas','POST',{...payload,requestId:randomUUID(),items:[{id:product.id,unit:'kg',quantity:-1}]},false);assert.equal(negative.status,400);
 });
 await t.test('Falha em um item não desconta os outros; concorrência não deixa saldo negativo',async()=>{
  const second=(await req('/api/insumos','POST',{name:'Parafuso',category:'Fixação',unit:'un',stock:1})).data;
  const partial=await req('/api/retiradas','POST',{requestId:randomUUID(),workId:work.id,personId:person.id,items:[{id:product.id,unit:'kg',quantity:1},{id:second.id,unit:'un',quantity:2}]},false);
  assert.equal(partial.status,409);assert.equal((await store.get('insumos',product.id)).stock,10.25);
  const payload={workId:work.id,personId:person.id,items:[{id:product.id,unit:'kg',quantity:8}]};
  const results=await Promise.all([req('/api/retiradas','POST',{...payload,requestId:randomUUID()},false),req('/api/retiradas','POST',{...payload,requestId:randomUUID()},false)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal((await store.get('insumos',product.id)).stock,2.25);
  assert.equal((await req('/api/insumos/'+second.id,'DELETE',{version:second.version})).status,200);
 });
 await t.test('Exclui registros das três tabelas preservando histórico',async()=>{
  const current=await store.get('insumos',product.id);
  assert.equal((await req('/api/insumos/'+product.id,'DELETE',{version:current.version},false)).status,401);
  assert.equal((await req('/api/insumos/'+product.id,'DELETE',{version:current.version})).status,200);
  assert.equal((await req('/api/obras/'+work.id,'DELETE',{version:work.version})).status,200);
  assert.equal((await req('/api/funcionarios/'+person.id,'DELETE',{version:person.version})).status,200);
  assert.deepEqual((await req('/api/catalogo')).data,{products:[],people:[],works:[]});
  const history=(await req('/api/retiradas')).data;assert.equal(history.length,2);assert.equal(history[0].items[0].name,'Cola editada');assert.equal(history[0].person,'Funcionário editado');
  await stop();await start();assert.equal((await store.history()).length,2);assert.equal((await store.list('insumos')).length,0);
 });
 await t.test('Logout revoga a sessão no servidor',async()=>{
  cookie=(await req('/api/login','POST',{username:'admin',password:'12345'})).cookie.split(';')[0];
  assert.equal((await req('/api/logout','POST',{})).status,200);
  assert.equal((await req('/api/obras','POST',{name:'Sem sessão'})).status,401);
  assert.equal((await req('/api/session')).data.admin,false);
 });
});
