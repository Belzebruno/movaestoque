import {openPostgres} from './postgres.mjs';
import {openDatabase} from './database.mjs';
const password=process.env.MOVA_CHECKLIST_PASSWORD;
if(!password||password.length<8)throw Error('Defina MOVA_CHECKLIST_PASSWORD com pelo menos 8 caracteres.');
const url=process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL;
const store=url?openPostgres(url):openDatabase();
try{if(url)await store.migrate();await store.checklist.seed(password);console.log('Conta exclusiva do checklist preparada.');}finally{await store.close();}

