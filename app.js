/* =====================================================================
   MARTINIANO · app.js
   Acceso directo (SIN Google / SIN Firebase Auth): Firestore + localStorage.
   Colecciones:
     usuarios_conectados/{id} -> { id, nombre, rol, conectado, timestamp,
                                   maquina, proceso, estadoOp, horaIngreso,
                                   horaCambioEstado, ultimaConexion, forzado }
     historial/{auto}         -> cada cambio de estado / conexión (campo dia)
   ===================================================================== */
import {initializeApp} from "firebase/app";
import {initializeFirestore,doc,getDoc,setDoc,updateDoc,addDoc,collection,onSnapshot,serverTimestamp,query,where} from "firebase/firestore";

const firebaseConfig={apiKey:"AIzaSyCmlq-PTA4Hxllyg8MX6rnqL_kPqLGUI9s",authDomain:"martiniano-2026.firebaseapp.com",projectId:"martiniano-2026",storageBucket:"martiniano-2026.firebasestorage.app",messagingSenderId:"152476581622",appId:"1:152476581622:web:5a89a6bbdec3bda6cdb6d7"};
const db=initializeFirestore(initializeApp(firebaseConfig),{experimentalAutoDetectLongPolling:true}); // estable en redes móviles
window.__ok=true;

/* ---------- Constantes ---------- */
const COL='usuarios_conectados',LS='martiniano_user',MAX_ASIS=5,STALE=10*60*1000;
const MAQ=["FG18039 - GASEOSERO","FG22020 - GASEOSERO","FG22001 - CON TAPA","FG18023 - CON TAPA","FG22003 - CON TAPA","FG22032 - CON TAPA","FG22024 - CON TAPA","FG22016 - CON TAPA","FG22004 - CON TAPA","FG18022 - CON TAPA","18006","18009"];
const EST_ADM=['Disponible','En Reunión','En Capacitación','En Descanso'];
const ESTADOS={montacarguista:['Disponible','En Proceso','En Descanso','En Taller','Fuera de Servicio'],asistente:EST_ADM,supervisor:EST_ADM};
const COLOR={'Disponible':'#22c55e','En Proceso':'#3b82f6','En Descanso':'#f59e0b','En Taller':'#8b5cf6','Fuera de Servicio':'#ef4444','En Reunión':'#6366f1','En Capacitación':'#0ea5e9'};
const RN={supervisor:'Supervisor',asistente:'Asistente de almacén',montacarguista:'Montacarguista'};
const TABS=[['resumen','Resumen'],['supervisor','Supervisor'],['asistentes','Asistentes'],['montacarguistas','Montacarguistas'],['historial','Historial']];

/* ---------- Iconos SVG ---------- */
const I={user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',users:'<circle cx="9" cy="8" r="3.5"/><path d="M2 21a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3"/>',shield:'<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>',truck:'<path d="M1 4h13v12H1zM14 8h4l4 4v4h-8"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',clip:'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h4"/>',copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',send:'<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>'};
const ic=n=>`<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;

/* ---------- Utilidades ---------- */
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ms=t=>t&&t.toMillis?t.toMillis():Date.now();
const hm=t=>t?new Date(ms(t)).toLocaleTimeString('es-PE',{timeZone:'America/Lima',hour:'2-digit',minute:'2-digit',hour12:false}):'--:--';
const hoy=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Lima'});
const bd=e=>`<span class="bd" style="--c:${COLOR[e]||'#64748b'}">${esc(e)}</span>`;
const ini=n=>esc((String(n||'?').trim()[0]||'?').toUpperCase());
const pic=(x,c='')=>`<span class="pic ph ${c}">${ini(x&&x.nombre)}</span>`;
const toast=(m,t=3500)=>{const e=$('toast');e.textContent=m;e.style.display='block';clearTimeout(e._t);e._t=setTimeout(()=>e.style.display='none',t)};
const fsErr=e=>showErr(e.code==='permission-denied'?'Firestore bloqueó el acceso (permission-denied). Publica las reglas nuevas en Firebase Console > Firestore > Reglas.':'Firestore: '+(e.code||e.message));
const guard=async f=>{try{return await f()}catch(e){console.error(e);fsErr(e)}};
// localStorage (con try/catch por si el navegador lo bloquea)
const lsGet=()=>{try{return JSON.parse(localStorage.getItem(LS))}catch(e){return null}};
const lsSet=v=>{try{v?localStorage.setItem(LS,JSON.stringify(v)):localStorage.removeItem(LS)}catch(e){}};
const newId=()=>'u'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);

/* ---------- Estado de la aplicación ---------- */
let me=null,S=[],H=[],view='resumen',dia=hoy(),dbOk=false,sessionReady=false,dirty=false,hb=null,unsubs=[],hUnsub=null,mineUnsub=null;
const ref=id=>doc(db,COL,id);
const fresh=x=>!x.ultimaConexion||Date.now()-ms(x.ultimaConexion)<STALE;
const by=rol=>S.filter(x=>x.rol===rol).sort((a,b)=>ms(b.horaIngreso)-ms(a.horaIngreso));
const canEdit=t=>t.id===me.id||me.rol==='supervisor'||(me.rol==='asistente'&&t.rol==='montacarguista');

/* ---------- Reloj y estado de conexión ---------- */
function hdr(){const on=navigator.onLine&&dbOk;$('live').innerHTML=on?'<span class="ok">● en vivo</span>':'<span class="no">● sin conexión</span>'}
addEventListener('online',hdr);addEventListener('offline',hdr);
setInterval(()=>{
 const pt=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',weekday:'long',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).formatToParts(new Date()),g=t=>(pt.find(x=>x.type===t)||{}).value||'';
 const W=g('weekday');$('clock').textContent=`${W[0].toUpperCase()+W.slice(1)} ${g('day')} ${g('month').replace('.','').replace(/^./,c=>c.toUpperCase())} - ${g('hour')}:${g('minute')}:${g('second')} ${g('dayPeriod').replace(/[ .\u00a0]/g,'').toUpperCase()}`;
},1000);

/* =====================================================================
   ACCESO DIRECTO (nombre + rol)
   ===================================================================== */
// Mostrar sólo una pantalla: 'login' | 'app'
function show(w){$('login').hidden=w!=='login';$('app').hidden=w!=='app';$('hbtn').dataset.logged=w==='app'?'1':'';if(w!=='app')$('menu').hidden=true}

async function entrar(){
 const nombre=$('nombre').value.trim().replace(/\s+/g,' '),rol=$('rol').value,err=m=>$('lerr').textContent=m;
 if(nombre.length<3)return err('Escribe tu nombre');
 if(!rol)return err('Selecciona tu rol');
 if(rol==='asistente'&&S.filter(x=>x.rol==='asistente'&&x.id!==(me&&me.id)).length>=MAX_ASIS)return err('Turno completo (5/5) - Máximo alcanzado');
 err('');
 const keep=me&&me.rol==='montacarguista'&&rol==='montacarguista';   // conserva la máquina si sigue siendo montacarguista
 const u={id:me?me.id:newId(),nombre,rol,maquina:keep?me.maquina||'':'',proceso:keep?me.proceso||'':''};
 try{await abrirSesion(u,false)}catch(e){fsErr(e)}
}

// Guarda en localStorage + Firestore (usuarios_conectados) y entra al panel
async function abrirSesion(u,resume){
 sessionReady=false;me=u;lsSet({id:u.id,nombre:u.nombre,rol:u.rol,maquina:u.maquina||'',proceso:u.proceso||''});
 let prev={};
 if(resume){const s=await getDoc(ref(u.id));if(s.exists())prev=s.data()}   // al recargar, conserva su estado
 await setDoc(ref(u.id),{id:u.id,nombre:u.nombre,rol:u.rol,conectado:true,timestamp:serverTimestamp(),
  maquina:u.maquina||'',proceso:u.proceso||'',estadoOp:prev.estadoOp||'Disponible',forzado:false,
  horaIngreso:prev.horaIngreso||serverTimestamp(),horaCambioEstado:prev.horaCambioEstado||serverTimestamp(),ultimaConexion:serverTimestamp()});
 sessionReady=true;
 if(!resume)log({tipo:'conexion',detalle:'Se conectó',estado:'Disponible'},me);
 // Si un supervisor me desconecta, salgo
 mineUnsub&&mineUnsub();
 mineUnsub=onSnapshot(ref(u.id),d=>{const x=d.data();if(sessionReady&&x&&x.forzado&&!x.conectado){toast('Un supervisor cerró tu sesión',6000);salir(false)}},fsErr);
 clearInterval(hb);hb=setInterval(()=>updateDoc(ref(me.id),{conectado:true,ultimaConexion:serverTimestamp()}).catch(()=>{}),30000);
 $('hav').textContent=u.nombre[0].toUpperCase();
 const h=location.hash.slice(1);view=TABS.some(t=>t[0]===h)?h:'resumen';
 show('app');render();
}

async function salir(write=true){
 clearInterval(hb);sessionReady=false;mineUnsub&&mineUnsub();mineUnsub=null;
 if(write&&me){try{await updateDoc(ref(me.id),{conectado:false,forzado:false});await log({tipo:'desconexion',detalle:'Cerró sesión'},me)}catch(e){}}
 lsSet(null);me=null;$('nombre').value='';$('rol').value='';$('lerr').textContent='';$('cancel').hidden=true;$('hav').textContent='';
 $('modal').hidden=true;show('login');
}
function cambiar(){$('nombre').value=me.nombre;$('rol').value=me.rol;$('lerr').textContent='';$('cancel').hidden=false;show('login')}
addEventListener('pagehide',()=>{if(me&&sessionReady)updateDoc(ref(me.id),{conectado:false}).catch(()=>{})});
document.addEventListener('visibilitychange',()=>{if(me&&sessionReady&&document.visibilityState==='visible')updateDoc(ref(me.id),{conectado:true,ultimaConexion:serverTimestamp()}).catch(()=>{})});

/* =====================================================================
   FIRESTORE EN TIEMPO REAL
   ===================================================================== */
function listen(){
 // Todos los usuarios conectados
 unsubs.push(onSnapshot(query(collection(db,COL),where('conectado','==',true)),{includeMetadataChanges:true},s=>{
  S=s.docs.map(d=>({...d.data({serverTimestamps:'estimate'}),id:d.id})).filter(fresh);
  dbOk=!s.metadata.fromCache;if(dbOk)$('err').hidden=true;hdr();paint();
 },e=>{dbOk=false;hdr();fsErr(e)}));
 listenHist();
}
function listenHist(){
 hUnsub&&hUnsub();
 hUnsub=onSnapshot(query(collection(db,'historial'),where('dia','==',dia)),s=>{
  H=s.docs.map(d=>d.data({serverTimestamps:'estimate'})).sort((a,b)=>ms(b.timestamp)-ms(a.timestamp));paint();
 },fsErr);
}
const log=(t,x)=>addDoc(collection(db,'historial'),{uid:x.id,nombre:x.nombre||'',rol:x.rol||'',maquina:x.maquina||'',tipo:t.tipo,detalle:t.detalle,estado:t.estado||'',por:t.por||'',dia:hoy(),timestamp:serverTimestamp()}).catch(fsErr);

// Cambiar estado operativo (propio, o de otro si el rol lo permite)
async function setEstado(id,e){
 const t=S.find(x=>x.id===id);if(!t||!canEdit(t)||t.estadoOp===e)return;
 await guard(async()=>{
  await updateDoc(ref(id),{estadoOp:e,horaCambioEstado:serverTimestamp(),ultimaConexion:serverTimestamp()});
  log({tipo:'estado',detalle:`Cambió a ${e}`,estado:e,por:id!==me.id?me.nombre:''},t);
 });
}
async function setMaquina(v){
 if(!v)return;
 const [maq,proc='']=v.split(' - '),o=S.find(x=>x.rol==='montacarguista'&&x.maquina===maq&&x.id!==me.id);
 if(o){toast(`${maq} ya está en uso por ${o.nombre}`);return paint(true)}
 await guard(async()=>{
  await updateDoc(ref(me.id),{maquina:maq,proceso:proc});
  me.maquina=maq;me.proceso=proc;lsSet({id:me.id,nombre:me.nombre,rol:me.rol,maquina:maq,proceso:proc});
  log({tipo:'maquina',detalle:`Cambió a la máquina ${maq}`},me);
 });
}
async function kick(id){
 if(me.rol!=='supervisor'||id===me.id)return;
 const t=S.find(x=>x.id===id);if(!t||!confirm(`¿Desconectar a ${t.nombre}?`))return;
 await guard(async()=>{await updateDoc(ref(id),{conectado:false,forzado:true});log({tipo:'desconexion',detalle:'Desconectado por supervisor',por:me.nombre},t)});
}

/* =====================================================================
   VISTAS
   ===================================================================== */
function paint(force){
 if(!me||!sessionReady)return;
 if(!force&&document.activeElement&&document.activeElement.tagName==='SELECT'){dirty=true;return} // no cerrar un desplegable abierto
 render();
}
function render(){
 $('tabs').innerHTML=TABS.map(([k,l])=>`<button class="tab ${k===view?'on':''}" data-v="${k}">${l}</button>`).join('');
 const mine=S.find(x=>x.id===me.id)||{id:me.id,nombre:me.nombre,rol:me.rol,maquina:me.maquina,estadoOp:'Disponible'};
 $('view').innerHTML=({resumen:vResumen,supervisor:vSup,asistentes:vAsis,montacarguistas:vMon,historial:vHist}[view]||vResumen)(mine);
}
const row=(x,tag,extra='')=>`<div class="row"><div class="who">${pic(x,'sm')}<div><b>${esc(x.nombre)}</b><small>${tag?tag+' · ':''}Ingreso ${hm(x.horaIngreso)}${x.maquina?' · '+esc(x.maquina):''}</small></div></div><div>${bd(x.estadoOp)} ${extra}</div></div>`;
const kickBtn=x=>me.rol==='supervisor'&&x.id!==me.id?`<button class="dng" data-a="kick" data-u="${x.id}">Desconectar</button>`:'';

// Tarjeta "Mi estado": botones grandes (1 activo a la vez) + máquina para montacarguista
function miCard(m){
 return `<div class="card"><h2>${ic('user')}Mi estado</h2>
 <div class="who">${pic(m)}<div><b>${esc(m.nombre)}</b><small>${RN[m.rol]}${m.maquina?' · '+esc(m.maquina):''}</small></div></div>
 <div class="conf">Estás en: ${bd(m.estadoOp)} <small>desde ${hm(m.horaCambioEstado)}</small></div>
 <div class="sts">${ESTADOS[m.rol].map(e=>`<button class="st ${e===m.estadoOp?'act':''}" style="--c:${COLOR[e]}" data-a="estado" data-u="${m.id}" data-e="${e}">${e}</button>`).join('')}</div>
 ${m.rol==='montacarguista'?`<label>Mi montacarga${m.maquina?'':' (elige uno)'}</label><select data-a="maq"><option value="" disabled ${m.maquina?'':'selected'}>Selecciona montacarga</option>${MAQ.map(x=>`<option ${x.split(' - ')[0]===m.maquina?'selected':''}>${x}</option>`).join('')}</select>`:''}</div>`;
}

function vResumen(m){
 const sup=by('supervisor'),as=by('asistente'),mo=by('montacarguista'),disp=mo.filter(x=>x.estadoOp==='Disponible').length;
 return miCard(m)+`<div class="grid3">
 <button class="sum" data-v="supervisor"><small>${ic('shield')}SUPERVISOR A CARGO</small><b>${sup[0]?esc(sup[0].nombre):'Sin supervisor'}</b>${sup[0]?bd(sup[0].estadoOp):'<span class="muted">—</span>'}</button>
 <button class="sum" data-v="asistentes"><small>${ic('users')}ASISTENTES</small><b>${as.length}/${MAX_ASIS} conectados</b><span class="muted">Toca para ver detalle</span></button>
 <button class="sum" data-v="montacarguistas"><small>${ic('truck')}MONTACARGUISTAS</small><b>${mo.length} conectados</b><span class="muted">${disp} disponibles</span></button></div>`
 +(me.rol==='supervisor'?'<button class="full blk" data-a="estatus">'+ic('clip')+'ESTATUS</button>':'');
}

function vSup(){
 const l=by('supervisor');
 let h=`<div class="card"><h2>${ic('shield')}Supervisor a cargo</h2>${l.length?l.map((x,i)=>row(x,i?'Conectado':'<b>A CARGO</b>')).join(''):'<p class="muted">Sin supervisor conectado</p>'}</div>`;
 if(me.rol==='supervisor'){
  h+=`<div class="card"><h2>Control total</h2><button class="full blk" data-a="estatus">${ic('clip')}ESTATUS (WhatsApp)</button></div>
  <div class="card"><h2>Usuarios conectados (${S.length})</h2>${S.map(x=>row(x,RN[x.rol],kickBtn(x))).join('')||'<p class="muted">Nadie conectado</p>'}</div>`;
 }
 return h;
}

function vAsis(){
 const l=by('asistente').slice().reverse();
 const slots=[0,1,2,3,4].map(i=>l[i]?row(l[i],`Asistente ${i+1}`,kickBtn(l[i])):`<div class="row slot"><b>Asistente ${i+1}</b><span>Disponible</span></div>`).join('');
 return `<div class="card"><h2>${ic('users')}Asistentes (${l.length}/${MAX_ASIS})</h2>${slots}</div>`;
}

function vMon(m){
 const l=by('montacarguista').sort((a,b)=>(a.estadoOp==='Disponible'?0:1)-(b.estadoOp==='Disponible'?0:1)||String(a.maquina).localeCompare(String(b.maquina)));
 const body=l.map(x=>`<tr><td><b>${esc(x.maquina||'—')}</b></td><td>${esc(x.proceso||'—')}</td><td>${esc(x.nombre)}</td>
  <td>${canEdit(x)?`<select data-a="estadoSel" data-u="${x.id}" style="border-left:6px solid ${COLOR[x.estadoOp]}">${ESTADOS.montacarguista.map(e=>`<option ${e===x.estadoOp?'selected':''}>${e}</option>`).join('')}</select>`:bd(x.estadoOp)}</td>
  <td>Ingreso ${hm(x.horaIngreso)}<br><small>${esc(x.estadoOp)} desde ${hm(x.horaCambioEstado)}</small></td>
  <td>${kickBtn(x)}</td></tr>`).join('');
 return (m.rol==='montacarguista'?miCard(m):'')+`<div class="card"><h2>${ic('truck')}Montacarguistas (${l.length})</h2><div class="tw"><table><thead><tr><th>MÁQUINA</th><th>PROCESO</th><th>NOMBRE</th><th>ESTADO</th><th>HORARIO</th><th></th></tr></thead><tbody>${body||'<tr><td colspan="6" class="muted">Sin montacarguistas conectados</td></tr>'}</tbody></table></div></div>`;
}

function vHist(){
 const items=H.map(h=>`<li><time>${hm(h.timestamp)}</time><span class="dot" style="--c:${COLOR[h.estado]||'#64748b'}"></span><div><b>${esc(h.nombre)}</b> <small>${RN[h.rol]||''}${h.maquina?' · '+esc(h.maquina):''}</small><br>${esc(h.detalle)}${h.por?` <small>(por ${esc(h.por)})</small>`:''}</div></li>`).join('');
 return `<div class="card"><h2>Historial ${dia===hoy()?'de hoy':dia}</h2>
 ${me.rol==='supervisor'?`<label>Ver otro día (historial completo)</label><input type="date" data-a="dia" value="${dia}">`:''}
 <ul class="tl">${items||'<li class="muted">Sin movimientos</li>'}</ul></div>`;
}

/* =====================================================================
   REPORTE ESTATUS (supervisor) + WhatsApp
   ===================================================================== */
function estText(){
 const f=new Intl.DateTimeFormat('en-US',{timeZone:'America/Lima',hour12:false,hour:'2-digit',day:'2-digit',month:'short',year:'2-digit'}).formatToParts(new Date()),g=t=>f.find(x=>x.type===t).value;
 const h=+g('hour')%24,t=h>=6&&h<14?'T1':h>=14&&h<22?'T2':'T3',pad=n=>String(n).padStart(2,'0');
 const ab=n=>{const w=String(n).trim().split(/\s+/);return w[0][0].toUpperCase()+(w.length>1?'. '+(w.length>=4?w[2]:w[1]):'')};
 const code=x=>String(x.maquina).replace(/^FG-?/,'');
 const as=by('asistente'),mo=by('montacarguista').sort((a,b)=>code(a).localeCompare(code(b)));
 return `*ASISTENCIA ${t}*\n*${g('day')+g('month').toUpperCase()+g('year')}*\n*Supervisor*\n${me.nombre}\n\n*Asistentes ${pad(as.length)}/${pad(+$('ea').value||0)}*\n${as.map(x=>x.nombre).join('\n')}\n\n*Montacarguistas ${pad(mo.length)}/${pad(+$('em').value||0)}*\n${mo.map(x=>x.maquina?`FG-${code(x)}. ${ab(x.nombre)}`:ab(x.nombre)).join('\n')}`;
}
function estatus(){
 $('modal').hidden=false;
 $('modal').innerHTML=`<div class="mbox"><h2>${ic('clip')}ESTATUS</h2><label>Asistentes esperados</label><input id="ea" type="number" value="2" min="0"><label>Montacarguistas esperados</label><input id="em" type="number" value="8" min="0"><textarea id="et"></textarea>
 <button class="full" data-a="copy">${ic('copy')}Copiar Texto</button><button class="full blk" data-a="wa">${ic('send')}Enviar por WhatsApp</button>
 <input id="ec" type="tel" inputmode="numeric" maxlength="9" placeholder="Celular (9 dígitos)"><button class="full" data-a="wan">${ic('phone')}Enviar a número específico</button><button class="full" data-a="close">Cerrar</button></div>`;
 const up=()=>$('et').value=estText();up();$('ea').oninput=$('em').oninput=up;
}
function perfilModal(){
 $('modal').hidden=false;
 $('modal').innerHTML=`<div class="mbox"><h2>Mi perfil</h2><div class="who">${pic(me)}<div><b>${esc(me.nombre)}</b><small>${RN[me.rol]}</small></div></div>
 ${me.maquina?`<div class="row"><span>Montacarga</span><b>${esc(me.maquina)} ${esc(me.proceso||'')}</b></div>`:''}
 <button class="full" data-a="close">Cerrar</button></div>`;
}

/* =====================================================================
   EVENTOS (delegación)
   ===================================================================== */
$('enter').onclick=entrar;
$('nombre').addEventListener('keydown',e=>{if(e.key==='Enter')entrar()});
$('cancel').onclick=()=>{$('cancel').hidden=true;show('app')};
$('hbtn').onclick=e=>{e.stopPropagation();if(!$('hbtn').dataset.logged)return;const m=$('menu');m.hidden=!m.hidden;$('hbtn').setAttribute('aria-expanded',!m.hidden)};
document.addEventListener('click',async ev=>{
 if(!ev.target.closest('#menu,#hbtn'))$('menu').hidden=true;
 const v=ev.target.closest('[data-v]');
 if(v){view=v.dataset.v;location.hash=view;render();return}
 const b=ev.target.closest('button[data-a]');if(!b)return;
 const a=b.dataset.a,d=b.dataset;$('menu').hidden=true;
 if(a==='perfil')perfilModal();
 else if(a==='rol')cambiar();
 else if(a==='logout')salir(true);
 else if(a==='close')$('modal').hidden=true;
 else if(a==='estado')setEstado(d.u,d.e);
 else if(a==='kick')kick(d.u);
 else if(a==='estatus')estatus();
 else if(a==='copy'){try{await navigator.clipboard.writeText($('et').value);toast('Texto copiado')}catch(e){$('et').select();toast('Selecciona y copia manualmente')}}
 else if(a==='wa')window.open(`https://wa.me/?text=${encodeURIComponent($('et').value)}`,'_blank');
 else if(a==='wan'){const c=$('ec').value.trim();if(!/^\d{9}$/.test(c))return toast('Celular de 9 dígitos');window.open(`https://wa.me/51${c}?text=${encodeURIComponent($('et').value)}`,'_blank')}
});
document.addEventListener('change',ev=>{
 const t=ev.target,a=t.dataset&&t.dataset.a;
 if(a==='estadoSel')setEstado(t.dataset.u,t.value);
 else if(a==='maq')setMaquina(t.value);
 else if(a==='dia'&&t.value){dia=t.value;listenHist()}
});
document.addEventListener('focusout',()=>{if(dirty){dirty=false;setTimeout(()=>paint(),150)}});
addEventListener('hashchange',()=>{const h=location.hash.slice(1);if(me&&TABS.some(t=>t[0]===h)){view=h;render()}});

/* =====================================================================
   ARRANQUE
   ===================================================================== */
hdr();listen();
const saved=lsGet();
if(saved&&saved.id&&saved.nombre&&ESTADOS[saved.rol])abrirSesion(saved,true).catch(e=>{fsErr(e);show('login')}); // reingreso automático
else show('login');
