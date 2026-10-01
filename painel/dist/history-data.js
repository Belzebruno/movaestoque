(function(root){
 const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
 function day(date){const parts=Object.fromEntries(dayFormatter.formatToParts(new Date(date)).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;}
 function flatten(records){return records.flatMap(r=>r.items.map(p=>({record:r.id,date:r.date,day:day(r.date),person:r.person,work:r.work,product:p.name,code:p.id,detail:p.detail||'',quantity:p.quantity,unit:p.unit})));}
 function filter(rows,f){return rows.filter(r=>(!f.person||r.person===f.person)&&(!f.work||r.work===f.work)&&(!f.product||r.code===f.product)&&(!f.from||r.day>=f.from)&&(!f.to||r.day<=f.to));}
 function cell(value){let s=String(value??'');if(/^[\s]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
 function csv(rows){const headers=['Retirada','Data e hora (Brasília)','Funcionário','Obra','Código do produto','Produto','Especificação','Quantidade','Unidade'];return '\uFEFF'+[headers,...rows.map(r=>[r.record,new Date(r.date).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),r.person,r.work,r.code,r.product,r.detail,String(r.quantity).replace('.',','),r.unit])].map(row=>row.map(cell).join(';')).join('\r\n')+'\r\n';}
 root.MovaHistory={flatten,filter,csv};
})(globalThis);
