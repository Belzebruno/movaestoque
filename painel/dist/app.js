const paths = {
  box:'<path d="m21 8-9-5-9 5v9l9 5 9-5Z"/><path d="m3 8 9 5 9-5M12 13v9M7.5 5.5l9 5"/>',
  'package-plus':'<path d="m16 3 5 3v6M3 6l9 5 9-5M12 11v10M8 3 3 6v10l9 5 3-1.5M16 18h6M19 15v6"/>',
  history:'<path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7M12 7v5l3 2"/>',
  sliders:'<path d="M4 7h9m4 0h3M4 17h3m4 0h9M13 4v6M7 14v6"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7h.01"/>',
  building:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M10 21v-6h4v6"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  clipboard:'<path d="M9 5H6a2 2 0 0 0-2 2v13h16V7a2 2 0 0 0-2-2h-3"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M8 12h8M8 16h5"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  'arrow-right':'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  x:'<path d="m6 6 12 12M6 18 18 6"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  wrench:'<path d="M14 6a5 5 0 0 0-6 6l-5 5a2.8 2.8 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3Z"/>',
  droplets:'<path d="M12 3c-3 4-7 8-7 12a7 7 0 0 0 14 0c0-4-4-8-7-12Z"/><path d="M9 15a3 3 0 0 0 3 3"/>',
  bolt:'<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
  pipe:'<path d="M4 3h8v7h8v10h-7v-4H5V3M2 3h12M20 8v14"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.box}</svg>`;
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const categoryIcons = {'Fixação':'wrench','Adesivos':'droplets','Elétrica':'bolt','Hidráulica':'pipe','Proteção':'shield','Outros':'box'};
const unitNames = {un:'Unidade',caixa:'Caixa',tubo:'Tubo',rolo:'Rolo',m:'Metro',kg:'Quilograma',L:'Litro',par:'Par'};
const categories = ['Todos','Fixação','Adesivos','Elétrica','Hidráulica','Proteção','Outros'];
const products=[],works=[],people=[];
const state={cart:new Map(),records:[],view:'retirada',admin:false,tab:'insumos',editing:null,deleting:null,reviewing:false,ready:false,pending:null,busy:false};

function apiType(type){return type==='pessoas'?'funcionarios':type;}
function requestId(){const bytes=crypto.getRandomValues(new Uint8Array(16));return [...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');}
function clearAdmin(){state.admin=false;state.records=[];$('#admin-content').innerHTML='';if(state.view==='admin')navigate('retirada');}
async function api(path,method='GET',body){
 let response;try{response=await fetch(path,{method,headers:{'Content-Type':'application/json','X-Mova-Client':'1'},body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin',signal:AbortSignal.timeout(15000)});}catch{throw Error('Sem conexão com o servidor. Confira a rede e tente novamente.');}
 const data=await response.json();if(!response.ok){if(response.status===401&&path!=='/api/login')clearAdmin();throw Error(data.error||'Não foi possível concluir.');}return data;
}
let loadingCatalog=null;
async function loadCatalog(){
 if(loadingCatalog)return loadingCatalog;
 loadingCatalog=(async()=>{try{const data=await api('/api/catalogo');let removed=false;for(const [id]of state.cart){const old=products.find(p=>p.id===id),fresh=data.products.find(p=>p.id===id);if(!fresh||old?.unit!==fresh.unit){state.cart.delete(id);removed=true;}}
 products.splice(0,products.length,...data.products);works.splice(0,works.length,...data.works);people.splice(0,people.length,...data.people);state.ready=true;refreshSelectors();renderCart();$('#add-selected').disabled=false;
 const missing=[];if(!products.length)missing.push('insumos');if(!works.length)missing.push('obras');if(!people.length)missing.push('funcionários');$('#data-status').hidden=!missing.length;$('#data-status-message').textContent=missing.length?'Cadastre '+missing.join(', ')+' na área administrativa para começar.':'';if(removed)toast('Um produto foi removido ou mudou de unidade. Confira a retirada.');if(state.admin&&state.view==='admin'&&state.tab!=='historico')renderAdmin();return true;
 }catch(error){state.ready=false;$('#data-status').hidden=false;$('#data-status-message').textContent=error.message;$('#add-selected').disabled=true;$('#review-button').disabled=true;return false;}finally{loadingCatalog=null;}})();return loadingCatalog;
}
async function loadAdmin(){if(!state.admin)return;await loadCatalog();if(state.tab==='historico'){try{state.records=await api('/api/retiradas');}catch(error){toast(error.message);return;}}renderAdmin();}
async function logout(){try{await api('/api/logout','POST',{});clearAdmin();toast('Você saiu da área administrativa.');}catch(error){toast(error.message);}}

const $=selector=>document.querySelector(selector);
const formatQuantity=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(n);
const fractional=p=>['m','kg','L'].includes(p?.unit);
function hydrateIcons(){document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,2600);}
function quantityOptions(p,current=1){const values=[...new Set([...(fractional(p)?[.25,.5,.75]:[]),...Array.from({length:100},(_,i)=>i+1),150,200,250,300,400,500,750,1000,current])].sort((a,b)=>a-b);return values.map(q=>`<option value="${q}" ${q===current?'selected':''}>${formatQuantity(q)} ${escapeHTML(p?.unit||'un')}</option>`).join('');}
function fillSelect(selector,items,placeholder,label){const el=$(selector),value=el.value;el.innerHTML=`<option value="">${placeholder}</option>`+items.map(p=>`<option value="${p.id}">${escapeHTML(label?label(p):p.name)}</option>`).join('');if(items.some(p=>p.id===value))el.value=value;}
function refreshSelectors(){fillSelect('#work',works,'Selecione a obra');fillSelect('#person',people,'Selecione o funcionário');fillSelect('#product',products,'Selecione o produto',p=>`${p.name}${p.detail?' · '+p.detail:''} — ${formatQuantity(p.stock)} ${p.unit} disponíveis`);refreshQuantity();}
function refreshQuantity(){const p=products.find(p=>p.id===$('#product').value),current=Number($('#quantity').value)||1;$('#quantity').innerHTML=quantityOptions(p,fractional(p)||Number.isInteger(current)?current:1);$('#quantity-unit').textContent=p?`(${p.unit})`:'';$('#quantity').disabled=!p;}
function renderCart(){
 $('#cart-badge').textContent=state.cart.size;$('#cart-total').textContent=`${state.cart.size} ${state.cart.size===1?'tipo':'tipos'}`;$('#review-button').disabled=!state.cart.size||!state.ready;$('#mobile-cart-button').hidden=!state.cart.size||state.view!=='retirada';$('#mobile-cart-count').textContent=`${state.cart.size} insumos`;
 $('#cart-content').innerHTML=state.cart.size?[...state.cart].map(([id,q])=>{const p=products.find(p=>p.id===id);return `<div class="cart-item"><div class="cart-item-header"><div><h3>${escapeHTML(p.name)}</h3><p class="product-meta">${escapeHTML(p.detail)}</p></div><button class="icon-button" data-remove="${id}" aria-label="Remover ${escapeHTML(p.name)} da retirada">${icon('trash')}</button></div><div class="field"><label for="qty-${id}">Quantidade (${p.unit})</label><select id="qty-${id}" data-quantity="${id}" aria-label="Quantidade de ${escapeHTML(p.name)}">${quantityOptions(p,q)}</select></div></div>`;}).join(''):`<div class="empty-cart"><div class="empty-cart-icon">${icon('clipboard')}</div><h3>Sua lista começa aqui</h3><p>Selecione um produto e toque em “Adicionar à retirada”.</p></div>`;
}
function addProduct(id,q){if(!state.ready)throw Error('Aguarde a conexão com o servidor.');const p=products.find(p=>p.id===id);if(!p)throw Error('Selecione um produto.');const total=Number(((state.cart.get(id)||0)+q).toFixed(3));if(!Number.isFinite(q)||q<=0||total>99999||(!fractional(p)&&!Number.isInteger(q))||Math.abs(q*1000-Math.round(q*1000))>1e-6)throw Error('Quantidade inválida.');if(total>p.stock)throw Error(`Saldo insuficiente. Disponível: ${formatQuantity(p.stock)} ${p.unit}.`);state.cart.set(id,total);renderCart();}
function validateWithdrawal(){const work=works.find(p=>p.id===$('#work').value),person=people.find(p=>p.id===$('#person').value);if(!work)return{error:'Selecione a obra de destino.',focus:'#work'};if(!person)return{error:'Selecione quem está retirando.',focus:'#person'};if(!state.cart.size)return{error:'Adicione pelo menos um produto.'};return{work:work.name,person:person.name};}
function openReview(){const r=validateWithdrawal();if(r.error){$('#form-error').textContent=r.error;$('#form-error').hidden=false;if(r.focus)$(r.focus).focus();return;}state.reviewing=true;$('#form-error').hidden=true;$('#review-body').innerHTML=`<div class="dialog-heading"><span class="eyebrow">CONFERÊNCIA</span><h2 id="review-title">Está tudo certo?</h2><p>Confira os produtos e as quantidades.</p></div><div class="review-destination"><div><small>Obra</small><strong>${escapeHTML(r.work)}</strong></div><div><small>Responsável</small><strong>${escapeHTML(r.person)}</strong></div></div><div class="review-items">${[...state.cart].map(([id,q])=>{const p=products.find(p=>p.id===id);return`<div class="review-item"><span>${escapeHTML(p.name)}</span><strong>${formatQuantity(q)} ${p.unit}</strong></div>`;}).join('')}</div><p class="review-note">Ao confirmar, os materiais serão descontados do estoque.</p><div class="review-actions"><button class="secondary-button" id="back-to-list">Voltar</button><button class="primary-button" id="confirm-withdrawal">${icon('check')}Confirmar retirada</button></div>`;$('#review-dialog').showModal();}
async function confirmWithdrawal(){
 if(!state.reviewing||state.busy)return;const r=validateWithdrawal();if(r.error)return;
 const data={workId:$('#work').value,personId:$('#person').value,items:[...state.cart].map(([id,quantity])=>({id,quantity,unit:products.find(p=>p.id===id).unit}))};
 const signature=JSON.stringify(data);if(state.pending?.signature!==signature)state.pending={signature,body:{...data,requestId:requestId()}};
 state.busy=true;const button=$('#confirm-withdrawal');button.disabled=true;button.textContent='Registrando…';
 try{const record=await api('/api/retiradas','POST',state.pending.body);state.pending=null;state.reviewing=false;state.cart.clear();$('#work').value='';$('#person').value='';$('#product').value='';renderCart();
 $('#review-body').innerHTML='<div class="success-content"><div class="success-icon">'+icon('check')+'</div><h2 id="review-title">Retirada registrada!</h2><p><strong>'+escapeHTML(record.id)+'</strong> · '+record.items.length+' insumo(s)<br>'+escapeHTML(record.work)+'<br><small>Estoque atualizado e registro salvo.</small></p><button class="primary-button" id="new-withdrawal">Nova retirada</button></div>';$('#new-withdrawal').focus();await loadCatalog();
 }catch(error){let el=$('#withdraw-error');if(!el){el=document.createElement('p');el.id='withdraw-error';el.className='form-error';el.setAttribute('role','alert');$('#review-body').append(el);}el.textContent=error.message;button.disabled=false;button.textContent='Confirmar retirada';}finally{state.busy=false;}
}
function dataset(type=state.tab){return type==='insumos'?products:type==='obras'?works:people;}
function adminOnly(){if(!state.admin){$('#login-dialog').showModal();return false;}return true;}
function navigate(view){if(view==='admin'&&!adminOnly())return;state.view=view;document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==`view-${view}`);document.querySelectorAll('.nav-item').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);if(el.dataset.view===view)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});$('#breadcrumb-current').textContent=view==='admin'?'Área administrativa':'Nova retirada';$('#mobile-cart-button').hidden=!state.cart.size||view!=='retirada';if(view==='admin')loadAdmin();}
function renderAdmin(){
 if(!state.admin)return;
 document.querySelectorAll('[data-admin-tab]').forEach(el=>{el.classList.toggle('active',el.dataset.adminTab===state.tab);el.setAttribute('aria-pressed',String(el.dataset.adminTab===state.tab));});
 $('#admin-section-title').textContent={insumos:'Insumos cadastrados',obras:'Obras cadastradas',pessoas:'Funcionários cadastrados',historico:'Histórico de retiradas'}[state.tab];$('#new-entry').hidden=state.tab==='historico';$('#new-entry-label').textContent={insumos:'Novo insumo',obras:'Nova obra',pessoas:'Novo funcionário'}[state.tab]||'';
 if(state.tab==='historico'){$('#admin-content').innerHTML=state.records.length?state.records.map(r=>`<article class="history-card"><div class="history-top"><h2>${escapeHTML(r.work)}</h2><time>${new Date(r.date).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</time></div><div class="history-meta">${icon('user')}${escapeHTML(r.person)}</div><div class="history-items">${r.items.map(p=>`<span>${formatQuantity(p.quantity)} ${p.unit} · ${escapeHTML(p.name)}</span>`).join('')}</div><div class="history-ref">${r.id}</div></article>`).join(''):`<div class="empty-state"><h2>Nenhuma retirada registrada</h2><p>As retiradas registradas pelos dispositivos aparecerão aqui.</p></div>`;return;}
 const rows=dataset();$('#admin-content').innerHTML=`<div class="admin-table-wrap"><table><thead><tr><th>Código</th><th>${state.tab==='insumos'?'Insumo':'Nome'}</th>${state.tab==='insumos'?'<th>Categoria</th><th>Unidade</th><th>Saldo</th>':''}<th>Ações</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${p.id}</td><td class="name-cell">${escapeHTML(p.name)}${p.detail?`<div class="product-meta">${escapeHTML(p.detail)}</div>`:''}</td>${state.tab==='insumos'?`<td><span class="category-tag">${escapeHTML(p.category)}</span></td><td>${escapeHTML(p.unit)}</td><td>${formatQuantity(p.stock)}</td>`:''}<td><div class="row-actions"><button class="secondary-button" data-edit="${p.id}" aria-label="Editar ${escapeHTML(p.name)}">Editar</button><button class="delete-button" data-delete="${p.id}" aria-label="Excluir ${escapeHTML(p.name)}">Excluir</button></div></td></tr>`).join('')}</tbody></table>${rows.length?'':'<div class="empty-state">Nenhum cadastro. Use o botão acima para adicionar.</div>'}</div>`;
}
function openEntry(id){if(!adminOnly()||state.tab==='historico')return;const p=id?dataset().find(p=>p.id===id):null;if(id&&!p)return;state.editing={id:id||null,type:state.tab,version:p?.version};$('#product-form').reset();$('#entry-error').hidden=true;const label={insumos:'insumo',obras:'obra',pessoas:'funcionário'}[state.tab];$('#product-title').textContent=p?`Editar ${label}`:`${state.tab==='obras'?'Nova':'Novo'} ${label}`;$('#entry-name-label').textContent=`Nome ${state.tab==='obras'?'da':'do'} ${label}`;$('#product-name').value=p?.name||'';const isProduct=state.tab==='insumos';$('#stock-field').hidden=!isProduct;$('#product-stock').disabled=!isProduct;$('#detail-field').hidden=!isProduct;$('#product-extra').hidden=!isProduct;if(isProduct){$('#product-stock').value=p?.stock??0;$('#product-detail').value=p?.detail||'';$('#product-category').value=p?.category||'Fixação';$('#product-unit').value=p?.unit||'un';}$('#product-dialog').showModal();}
function requestDelete(id){if(!adminOnly())return;const p=dataset().find(p=>p.id===id);if(!p)return;state.deleting={id,type:state.tab,version:p.version};$('#delete-description').textContent=`Excluir “${p.name}”? O cadastro será removido das opções de retirada.${state.tab==='insumos'&&state.cart.has(id)?' Este produto também será removido da retirada em montagem.':''} Os registros anteriores serão mantidos.`;$('#delete-dialog').showModal();}
async function confirmDelete(){
 if(!state.admin||!state.deleting||state.busy)return;const {id,type,version}=state.deleting;state.busy=true;$('#confirm-delete').disabled=true;
 try{await api('/api/'+apiType(type)+'/'+id,'DELETE',{version});state.deleting=null;$('#delete-dialog').close();await loadCatalog();renderAdmin();toast('Cadastro excluído do banco.');}
 catch(error){$('#delete-description').textContent=error.message;await loadCatalog();renderAdmin();}finally{state.busy=false;$('#confirm-delete').disabled=false;}
}
document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;
 if(b.dataset.view)navigate(b.dataset.view);
 if(b.dataset.adminTab&&adminOnly()){state.tab=b.dataset.adminTab;loadAdmin();}
 if(b.dataset.edit)openEntry(b.dataset.edit);if(b.dataset.delete)requestDelete(b.dataset.delete);
 if(b.dataset.remove){state.cart.delete(b.dataset.remove);renderCart();}
 if(b.id==='add-selected'){try{addProduct($('#product').value,Number($('#quantity').value));$('#selection-error').hidden=true;toast('Produto adicionado à retirada.');}catch(error){$('#selection-error').textContent=error.message;$('#selection-error').hidden=false;$('#product').focus();}}
 if(b.id==='review-button')openReview();if(b.id==='refresh-data')loadCatalog().then(()=>{if(state.view==='admin')loadAdmin();});if(b.id==='confirm-withdrawal')confirmWithdrawal();if(b.id==='back-to-list'||b.id==='new-withdrawal')$('#review-dialog').close();
 if(b.id==='new-entry')openEntry();if(b.id==='confirm-delete')confirmDelete();if(b.id==='cancel-delete'){$('#delete-dialog').close();state.deleting=null;}
 if(b.id==='logout')logout();
 if(b.id==='mobile-cart-button')$('.withdraw-panel').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
});
$('#product').addEventListener('change',refreshQuantity);
$('#cart-content').addEventListener('change',event=>{const id=event.target.dataset.quantity;if(!id)return;const p=products.find(p=>p.id===id),q=Number(event.target.value);if(p&&Number.isFinite(q)&&q>0&&q<=99999&&(fractional(p)||Number.isInteger(q)))state.cart.set(id,q);else renderCart();});
$('#login-form').addEventListener('submit',async event=>{
 event.preventDefault();const button=event.target.querySelector('[type="submit"]');button.disabled=true;
 try{await api('/api/login','POST',{username:$('#username').value.trim(),password:$('#password').value});state.admin=true;$('#login-error').hidden=true;event.target.reset();$('#login-dialog').close();navigate('admin');}
 catch(error){$('#login-error').textContent=error.message;$('#login-error').hidden=false;$('#password').value='';$('#password').focus();}finally{button.disabled=false;}
});
$('#product-form').addEventListener('submit',async event=>{
 event.preventDefault();if(!state.admin||!state.editing||state.busy)return;const {id,type,version}=state.editing,name=$('#product-name').value.trim();if(!name)return;
 const updated={name,version};if(type==='insumos'){updated.detail=$('#product-detail').value.trim();updated.category=$('#product-category').value;updated.unit=$('#product-unit').value;updated.stock=Number($('#product-stock').value);}
 state.busy=true;const button=event.target.querySelector('[type="submit"]');button.disabled=true;$('#entry-error').hidden=true;
 try{await api('/api/'+apiType(type)+(id?'/'+id:''),id?'PUT':'POST',updated);$('#product-dialog').close();await loadCatalog();renderAdmin();toast('Cadastro salvo no banco.');}
 catch(error){$('#entry-error').textContent=error.message;$('#entry-error').hidden=false;}finally{state.busy=false;button.disabled=false;}
});
$('#review-dialog').addEventListener('close',()=>state.reviewing=false);
$('.brand').addEventListener('click',event=>{event.preventDefault();navigate('retirada');});
window.addEventListener('beforeunload',event=>{if(state.cart.size){event.preventDefault();event.returnValue='';}});
$('#current-date').textContent=new Date().toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'});hydrateIcons();refreshSelectors();renderCart();navigate('retirada');loadCatalog();api('/api/session').then(s=>state.admin=s.admin).catch(()=>{});setInterval(()=>{if(!document.hidden&&!document.querySelector('dialog[open]')&&!state.busy){loadCatalog();api('/api/session').then(s=>{if(state.admin&&!s.admin)clearAdmin();}).catch(()=>{});}},15000);window.addEventListener('focus',()=>{if(!document.querySelector('dialog[open]'))loadCatalog();});
if(document.modelContext?.registerTool){const lifecycle=new AbortController();try{Promise.resolve(document.modelContext.registerTool({name:'stage_withdrawal_item',title:'Adicionar insumo à lista',description:'Adiciona um produto à lista de retirada, sem confirmar ou alterar estoque.',inputSchema:{type:'object',properties:{code:{type:'string'},quantity:{type:'number',exclusiveMinimum:0,maximum:99999}},required:['code','quantity'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||typeof input.code!=='string'||typeof input.quantity!=='number')throw Error('Informe código e quantidade.');addProduct(input.code,input.quantity);navigate('retirada');return{code:input.code,quantity:state.cart.get(input.code),status:'staged'};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}


const simplifiedScreen = window.matchMedia('(max-width: 1100px), (hover: none) and (pointer: coarse)');
function applySimplifiedScreen() {
 if (!simplifiedScreen.matches) return;
 document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
 if (state.view !== 'retirada') navigate('retirada');
}
simplifiedScreen.addEventListener('change', applySimplifiedScreen);
applySimplifiedScreen();
