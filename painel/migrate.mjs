import {openPostgres} from './postgres.mjs';
const store=openPostgres(process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL);
try {await store.migrate();console.log('Tabelas MOVA atualizadas no Postgres.');} finally {await store.close();}
