import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {HttpError} from './validation.mjs';

// Keep failure state even when authentication fails; never expose these fields.
export function checkWorkerPin(row,body,now=Date.now()) {
 if(typeof body.pin!=='string'||!/^\d{4}$/.test(body.pin))return {error:new HttpError(400,'Digite uma senha de 4 dígitos.')};
 if(row?.bloqueado_ate>now)return {error:new HttpError(429,'Muitas tentativas. Aguarde 15 minutos para tentar novamente.')};
 if(!row){
  if(body.pinConfirm!==body.pin)return {error:new HttpError(400,'Confirme a mesma senha de 4 dígitos.')};
  const salt=randomBytes(32).toString('hex');
  return {save:{salt,hash:scryptSync(body.pin,salt,64).toString('hex'),failures:0,blocked:0}};
 }
 const valid=timingSafeEqual(scryptSync(body.pin,row.salt,64),Buffer.from(row.pin_hash,'hex'));
 if(!valid){
  const blocked=Number(row.bloqueado_ate);
  const failures=(blocked>0&&blocked<=now?0:row.tentativas)+1;
  return {save:{salt:row.salt,hash:row.pin_hash,failures,blocked:failures>=5?now+15*60*1000:0},error:new HttpError(failures>=5?429:403,failures>=5?'Muitas tentativas. Aguarde 15 minutos.':'Senha incorreta. Tente novamente.')};
 }
 return {save:{salt:row.salt,hash:row.pin_hash,failures:0,blocked:0}};
}
