export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new HttpError(status,message);};
const types={insumos:{prefix:'INS'},funcionarios:{prefix:'FUN'},obras:{prefix:'OBR'}};
const categories=['Fixação','Adesivos','Elétrica','Hidráulica','Proteção','Outros'];
const units=['un','caixa','tubo','rolo','m','kg','L','par'];
const fractional=unit=>['m','kg','L'].includes(unit);
const code=(type,id)=>types[type].prefix+String(id).padStart(3,'0');
function idOf(type,value){const match=String(value).match(new RegExp(`^${types[type].prefix}(\\d+)$`));if(!match||!Number.isSafeInteger(Number(match[1]))||Number(match[1])<1)fail(400,'Código inválido.');return Number(match[1]);}
function text(value,max,required=true){if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))fail(400,'Preencha os campos corretamente.');return value.trim();}
function amount(value,unit,allowZero=true){if(typeof value!=='number'||!Number.isFinite(value)||value<0||(!allowZero&&value===0)||value>999999999||Math.abs(value*1000-Math.round(value*1000))>0.0001||(!fractional(unit)&&!Number.isInteger(value)))fail(400,'Quantidade inválida para a unidade. Use até 3 casas decimais para kg, m ou L.');return Math.round(value*1000);}
function publicRow(type,row){if(!row)return null;return{id:code(type,row.id),name:row.nome,version:row.versao,...(type==='insumos'?{detail:row.especificacao,category:row.categoria,unit:row.unidade,stock:row.saldo_milesimos/1000}:{})};}

export {fail,types,categories,units,code,idOf,text,amount,publicRow};
