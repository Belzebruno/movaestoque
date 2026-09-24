import {networkInterfaces} from 'node:os';
import {openDatabase} from './database.mjs';
import {createApp} from './http-app.mjs';
const store=openDatabase();
const server=createApp(store);
const port=Number(process.env.PORT||3000);
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`A porta ${port} está em uso.`:error.message);store.close();process.exit(1);});
server.listen(port,'0.0.0.0',()=>{
 console.log(`\nMOVA — Controle de estoque\nLocal: http://localhost:${server.address().port}`);
 for(const entries of Object.values(networkInterfaces()))for(const entry of entries||[])if(entry.family==='IPv4'&&!entry.internal)console.log(`Tablet: http://${entry.address}:${server.address().port}`);
 console.log(`Banco: ${store.filename}\n`);
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{store.close();process.exit(0);}));
