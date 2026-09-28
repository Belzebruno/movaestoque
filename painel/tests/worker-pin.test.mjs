import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../database.mjs';
import {openPostgres} from '../postgres.mjs';

for(const engine of ['sqlite','postgres'])test(`PIN e lista de retirada: ${engine}`,{skip:engine==='postgres'&&!process.env.MOVA_TEST_DATABASE_URL},async t=>{
 let db,root,schema;
 if(engine==='sqlite')db=openDatabase(':memory:');
 else{
  assert.notEqual(process.env.MOVA_TEST_DATABASE_URL,process.env.DATABASE_URL);
  root=openPostgres(process.env.MOVA_TEST_DATABASE_URL);
  schema='test_pin_'+randomUUID().replaceAll('-','');
  await root.pool.query(`CREATE SCHEMA ${schema}`);
  const url=new URL(process.env.MOVA_TEST_DATABASE_URL);url.searchParams.set('options','-c search_path='+schema);
  db=openPostgres(url.toString());await db.migrate();
 }
 t.after(async()=>{await db.close();if(root){await root.pool.query(`DROP SCHEMA ${schema} CASCADE`);await root.close();}});
 const person=await db.save('funcionarios',{name:'Teste PIN'}),work=await db.save('obras',{name:'Teste obra'});
 const a=await db.save('insumos',{name:'Parafuso',unit:'un',category:'Fixação',stock:10});
 const b=await db.save('insumos',{name:'Cola',unit:'kg',category:'Adesivos',stock:5});
 const payload=()=>({requestId:randomUUID(),workId:work.id,personId:person.id,items:[{id:a.id,unit:'un',quantity:2},{id:b.id,unit:'kg',quantity:.5}]});
 const reject=(body,status)=>assert.rejects(async()=>db.withdraw(body),e=>e.status===status);
 assert.deepEqual(await db.pinStatus(person.id),{registered:false});
 await reject(payload(),400);
 await reject({...payload(),pin:'0123',pinConfirm:'9999'},400);
 assert.equal((await db.pinStatus(person.id)).registered,false);
 assert.equal((await db.get('insumos',a.id)).stock,10);
 const first={...payload(),pin:'0123',pinConfirm:'0123'};
 const saved=await db.withdraw(first);assert.equal(saved.items.length,2);
 assert.equal((await db.pinStatus(person.id)).registered,true);
 assert.equal((await db.get('insumos',a.id)).stock,8);
 assert.equal((await db.get('insumos',b.id)).stock,4.5);
 // Retrying must still authenticate, including when the request ID already exists.
 await reject({...first,pin:'9999'},403);
 assert.equal((await db.withdraw({...first,pinConfirm:undefined})).id,saved.id);
 assert.equal((await db.get('insumos',a.id)).stock,8);
 await reject({...payload(),pin:123},400);
 await reject({...payload(),pin:'abcd'},400);
 const second=await db.withdraw({...payload(),pin:'0123'});assert.notEqual(second.id,saved.id);
 const publicPeople=JSON.stringify(await db.list('funcionarios'));assert(!publicPeople.includes('pin_hash'));assert(!publicPeople.includes('0123'));
 for(let i=0;i<5;i++)await reject({...payload(),pin:'9999'},i===4?429:403);
 await reject({...payload(),pin:'0123'},429);
 assert.equal((await db.get('insumos',a.id)).stock,6);
 // Simulate expiry; correct PIN is accepted again.
 if(engine==='sqlite')db.db.prepare('UPDATE funcionario_pins SET bloqueado_ate=1').run();
 else await db.pool.query('UPDATE funcionario_pins SET bloqueado_ate=1');
 await db.withdraw({...payload(),pin:'0123'});
 const other=await db.save('funcionarios',{name:'Outro funcionário'});
 await reject({...payload(),personId:other.id,pin:'0123'},400);
 assert.equal((await db.pinStatus(other.id)).registered,false);
 const raceBody={...payload(),personId:other.id,items:[{id:b.id,unit:'kg',quantity:.25}]};
 const results=await Promise.allSettled([
  Promise.resolve().then(()=>db.withdraw({...raceBody,requestId:randomUUID(),pin:'1111',pinConfirm:'1111'})),
  Promise.resolve().then(()=>db.withdraw({...raceBody,requestId:randomUUID(),pin:'2222',pinConfirm:'2222'}))
 ]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected').length,1);
});
