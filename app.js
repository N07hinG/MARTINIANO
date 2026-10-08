/* =====================================================================
   MARTINIANO · app.js
   Firebase v10 modular: Auth (Google) + Firestore en tiempo real.
   Colecciones:
     usuarios/{uid}  -> perfil persistente (rol, máquina, celular)
     sesiones/{uid}  -> sesión conectada (uid,email,displayName,photoURL,rol,
                        estado:'conectado', timestamp, estadoOp, maquina...)
     historial/{id}  -> cada cambio de estado/conexión (campo dia = YYYY-MM-DD)
   ===================================================================== */
import {initializeApp} from "firebase/app";
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,onAuthStateChanged,signOut} from "firebase/auth";
import {initializeFirestore,doc,getDoc,setDoc,updateDoc,addDoc,collection,onSnapshot,serverTimestamp,query,where} from "firebase/firestore";

const firebaseConfig={apiKey:"AIzaSyCmlq-PTA4Hxllyg8MX6rnqL_kPqLGUI9s",authDomain:"martiniano-2026.firebaseapp.com",projectId:"martiniano-2026",storageBucket:"martiniano-2026.firebasestorage.app",messagingSenderId:"152476581622",appId:"1:152476581622:web:5a89a6bbdec3bda6cdb6d7"};
const fbApp=initializeApp(firebaseConfig);
const auth=getAuth(fbApp);
const db=initializeFirestore(fbApp,{experimentalAutoDetectLongPolling:true}); // más estable en redes móviles
window.__ok=true;

/* ---------- Constantes ---------- */
const SUP_PASS='@vpo2026',MAX_ASIS=5,STALE=10*60*1000;
const MAQ=["FG18039 - GASEOSERO","FG22020 - GASEOSERO","FG22001 - CON TAPA","FG18023 - CON TAPA","FG22003 - CON TAPA","FG22032 - CON TAPA","FG22024 - CON TAPA","FG22016 - CON TAPA","FG22004 - CON TAPA","FG18022 - CON TAPA","18006","18009"];
const EST_ADM=['Disponible','En Reunión','En Capacitación','En Descanso'];
const ESTADOS={montacarguista:['Disponible','En Proceso','En Descanso','En Taller','Fuera de Servicio'],asistente:EST_ADM,supervisor:EST_ADM};
const COLOR={'Disponible':'#22c55e','En Proceso':'#3b82f6','En Descanso':'#f59e0b','En Taller':'#8b5cf6','Fuera de Servicio':'#ef4444','En Reunión':'#6366f1','En Capacitación':'#0ea5e9'};
const RN={supervisor:'Supervisor',asistente:'Asistente',montacarguista:'Montacarguista'};
const TABS=[['resumen','Resumen'],['supervisor','Supervisor'],['asistentes','Asistentes'],['montacarguistas','Montacarguistas'],['historial','Historial']];

/* ---------- Iconos SVG ---------- */
const I={user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',users:'<circle cx="9" cy="8" r="3.5"/><path d="M2 21a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3"/>',shield:'<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>',truck:'<path d="M1 4h13v12H1zM14 8h4l4 4v4h-8"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',clip:'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h4"/>',copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',send:'<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>'};
const ic=n=>`<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;
const ROLE_ICON={supervisor:'shield',asistente:'user',montacarguista:'truck'};

/* ---------- Utilidades ---------- */
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ms=t=>t&&t.toMillis?t.toMillis():Date.now();
const hm=t=>t?new Date(ms(t)).toLocaleTimeString('es-PE',{timeZone:'America/Lima',hour:'2-digit',minute:'2-digit',hour12:false}):'--:--';
const hoy=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Lima'});
const bd=e=>`<span class="bd" style="--c:${COLOR[e]||'#64748b'}">${esc(e)}</span>`;
const pic=(x,c='')=>x&&x.photoURL?`<img class="pic ${c}" src="${esc(x.photoURL)}" alt="" referrerpolicy="no-referrer">`:`<span class="pic ph ${c}">${ic('user')}</span>`;
const toast=(m,t=3500)=>{const e=$('toast');e.textContent=m;e.style.display='block';clearTimeout(e._t);e._t=setTimeout(()=>e.style.display='none',t)};
const fsErr=e=>showErr(e.code==='permission-denied'?'Firestore bloqueó el acceso (permission-denied). Publica las reglas de firestore.rules en Firebase Console > Firestore > Reglas.':'Firestore: '+(e.code||e.message));
const guard=async f=>{try{return await f()}catch(e){console.error(e);fsErr(e)}};

/* ---------- Estado de la aplicación ---------- */
let user=null,perfil=null,S=[],H=[],view='resumen',dia=hoy(),dbOk=false,sessionReady=false,dirty=false,hb=null,unsubs=[],hUnsub=null;
const sesRef=()=>doc(db,'sesiones',user.uid);
const fresh=x=>!x.ultimaConexion||Date.now()-ms(x.ultimaConexion)<STALE;
const by=rol=>S.filter(x=>x.rol===rol).sort((a,b)=>ms(b.horaIngreso)-ms(a.horaIngreso));
const canEdit=t=>t.uid===user.uid||perfil.rol==='supervisor'||(perfil.rol==='asistente'&&t.rol==='montacarguista');

/* ---------- Reloj y estado de conexión ---------- */
function hdr(){const on=navigator.onLine&&dbOk;$('live').innerHTML=on?'<span class="ok">● en vivo</span>':'<span class="no">● sin conexión</span>'}
addEventListener('online',hdr);addEventListener('offline',hdr);
setInterval(()=>{
 const pt=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',weekday:'long',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).formatToParts(new Date()),g=t=>(pt.find(x=>x.type===t)||{}).value||'';
 const W=g('weekday');$('clock').textContent=`${W[0].toUpperCase()+W.slice(1)} ${g('day')} ${g('month').replace('.','').replace(/^./,c=>c.toUpperCase())} - ${g('hour')}:${g('minute')}:${g('second')} ${g('dayPeriod').replace(/[ .\u00a0]/g,'').toUpperCase()}`;
},1000);

/* =====================================================================
   AUTENTICACIÓN
   ===================================================================== */
// Mostrar sólo una pantalla: 'login' | 'app' | ''
function show(w){$('login').hidden=w!=='login';$('app').hidden=w!=='app';$('hbtn').dataset.logged=w==='app'?'1':''}

async function login(){
 const p=new GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});
 try{await signInWithPopup(auth,p)}
 catch(e){
  if(e.code==='auth/popup-blocked'||e.code==='auth/operation-not-supported-in-this-environment')return signInWithRedirect(auth,p);
  if(!['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(e.code))showErr('Login: '+(e.code||e.message));
 }
}

// Un único listener de sesión: decide qué pantalla mostrar (sin bucles)
let currentUid=null;
onAuthStateChanged(auth,async u=>{
 if(u&&u.uid===currentUid)return;           // evita reinicializar al mismo usuario
 currentUid=u?u.uid:null;user=u;
 if(!u){resetState();show('login');return}
 try{
  listen();                                  // sesiones + historial en tiempo real
  const snap=await getDoc(doc(db,'usuarios',u.uid));
  perfil=snap.exists()&&snap.data().rol?snap.data():null;
  if(perfil)await abrirSesion();             // ya tiene rol -> entra directo
  else{show('');roleModal(false)}  // sin rol -> selector obligatorio
 }catch(e){fsErr(e)}
});

function resetState(){stop();clearInterval(hb);perfil=null;S=[];H=[];sessionReady=false;$('modal').hidden=true;$('menu').hidden=true;$('hav').outerHTML='<span class="pic ph" id="hav">'+ic('user')+'</span>'}

async function logout(write=true){
 clearInterval(hb);sessionReady=false;
 if(write&&user&&perfil){try{await updateDoc(sesRef(),{estado:'desconectado',forzado:false});await log({tipo:'desconexion',detalle:'Cerró sesión'},{uid:user.uid,displayName:user.displayName,rol:perfil.rol,maquina:perfil.maquina})}catch(e){}}
 $('modal').hidden=true;await signOut(auth);
}
addEventListener('pagehide',()=>{if(user&&sessionReady)updateDoc(sesRef(),{estado:'desconectado'}).catch(()=>{})});
document.addEventListener('visibilitychange',()=>{if(user&&sessionReady&&document.visibilityState==='visible')updateDoc(sesRef(),{estado:'conectado',ultimaConexion:serverTimestamp()}).catch(()=>{})});

/* =====================================================================
   SESIÓN + ROLES
   ===================================================================== */
// Crea/actualiza sesiones/{uid} con la estructura pedida
async function abrirSesion(){
 sessionReady=false;
 await setDoc(sesRef(),{uid:user.uid,email:user.email,displayName:user.displayName||user.email,photoURL:user.photoURL||'',rol:perfil.rol,
  maquina:perfil.maquina||'',proceso:perfil.proceso||'',celular:perfil.celular||'',
  estado:'conectado',estadoOp:'Disponible',forzado:false,
  horaIngreso:serverTimestamp(),horaCambioEstado:serverTimestamp(),ultimaConexion:serverTimestamp(),timestamp:serverTimestamp()});
 sessionReady=true;
 log({tipo:'conexion',detalle:'Se conectó',estado:'Disponible'},{uid:user.uid,displayName:user.displayName,rol:perfil.rol,maquina:perfil.maquina});
 clearInterval(hb);hb=setInterval(()=>updateDoc(sesRef(),{ultimaConexion:serverTimestamp()}).catch(()=>{}),30000);
 const h=$('hav');h.outerHTML=user.photoURL?`<img class="pic" id="hav" src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">`:`<span class="pic ph" id="hav">${ic('user')}</span>`;
 show('app');$('modal').hidden=true;
 const h2=location.hash.slice(1);view=TABS.some(t=>t[0]===h2)?h2:'resumen';
 render();
}

// Selector de rol (paso 1) y formulario (paso 2)
function roleModal(canCancel){
 $('modal').hidden=false;
 $('modal').innerHTML=`<div class="mbox full-s"><h2 style="font-size:16px">Selecciona tu rol</h2>
 ${Object.keys(RN).map(r=>`<button class="role" data-a="role" data-r="${r}">${ic(ROLE_ICON[r])}${RN[r].toUpperCase()}</button>`).join('')}
 ${canCancel?'<button class="full" data-a="close">Cancelar</button>':'<button class="full" data-a="logout">Cerrar sesión</button>'}</div>`;
}
function roleForm(r,canCancel){
 $('modal').innerHTML=`<div class="mbox"><h2 style="font-size:16px">${ic(ROLE_ICON[r])}${RN[r]}</h2>
 ${r==='supervisor'?'<label>Contraseña de supervisor</label><input id="rp" type="password" autocomplete="off">':''}
 ${r==='asistente'?'<p>Confirma tu ingreso como asistente (máximo 5 por turno).</p>':''}
 ${r==='montacarguista'?`<label>Montacarga</label><select id="rm"><option value="">Selecciona montacarga</option>${MAQ.map(m=>`<option>${m}</option>`).join('')}</select><label>Celular (opcional, 9 dígitos)</label><input id="rc" type="tel" inputmode="numeric" maxlength="9">`:''}
 <div class="rerr" id="rerr"></div>
 <button class="full blk" data-a="rolOk" data-r="${r}">INGRESAR</button><button class="full" data-a="roles" data-c="${canCancel?1:''}">Atrás</button></div>`;
}
async function rolOk(r){
 const err=m=>$('rerr').textContent=m;let maq='',proc='',cel='';
 if(r==='supervisor'&&$('rp').value!==SUP_PASS)return err('Contraseña incorrecta');
 if(r==='asistente'&&S.filter(x=>x.rol==='asistente'&&x.uid!==user.uid).length>=MAX_ASIS)return err('Turno completo (5/5) - Máximo alcanzado');
 if(r==='montacarguista'){
  const v=$('rm').value;if(!v)return err('Elige tu montacarga');
  [maq,proc='']=v.split(' - ');
  const o=S.find(x=>x.rol==='montacarguista'&&x.maquina===maq&&x.uid!==user.uid);if(o)return err(`${maq} ya está en uso por ${o.displayName}`);
  cel=$('rc').value.trim();if(cel&&!/^\d{9}$/.test(cel))return err('El celular debe tener 9 dígitos');
 }
 perfil={rol:r,maquina:maq,proceso:proc,celular:cel};
 await guard(async()=>{
  await setDoc(doc(db,'usuarios',user.uid),{uid:user.uid,email:user.email,displayName:user.displayName||user.email,photoURL:user.photoURL||'',...perfil,actualizado:serverTimestamp()},{merge:true});
  await abrirSesion();
 });
}

/* =====================================================================
   FIRESTORE EN TIEMPO REAL
   ===================================================================== */
function listen(){
 stop();
 // Todos los usuarios conectados
 unsubs.push(onSnapshot(query(collection(db,'sesiones'),where('estado','==','conectado')),{includeMetadataChanges:true},s=>{
  S=s.docs.map(d=>({id:d.id,...d.data({serverTimestamps:'estimate'})})).filter(fresh);
  dbOk=!s.metadata.fromCache;if(dbOk)$('err').hidden=true;hdr();paint();
 },e=>{dbOk=false;hdr();fsErr(e)}));
 // Mi propia sesión: si un supervisor me desconecta, salgo
 unsubs.push(onSnapshot(sesRef(),d=>{const x=d.data();if(sessionReady&&x&&x.forzado&&x.estado==='desconectado'){toast('Un supervisor cerró tu sesión',6000);logout(false)}},fsErr));
 listenHist();
}
function listenHist(){
 hUnsub&&hUnsub();
 hUnsub=onSnapshot(query(collection(db,'historial'),where('dia','==',dia)),s=>{
  H=s.docs.map(d=>d.data({serverTimestamps:'estimate'})).sort((a,b)=>ms(b.timestamp)-ms(a.timestamp));paint();
 },fsErr);
}
function stop(){unsubs.forEach(f=>f());unsubs=[];hUnsub&&hUnsub();hUnsub=null}

const log=(t,x)=>addDoc(collection(db,'historial'),{uid:x.uid,nombre:x.displayName||'',rol:x.rol||'',maquina:x.maquina||'',tipo:t.tipo,detalle:t.detalle,estado:t.estado||'',por:t.por||'',dia:hoy(),timestamp:serverTimestamp()}).catch(fsErr);

// Cambiar estado operativo (propio o de otro si el rol lo permite)
async function setEstado(uid,e){
 const t=S.find(x=>x.uid===uid);if(!t||!canEdit(t)||t.estadoOp===e)return;
 await guard(async()=>{
  await updateDoc(doc(db,'sesiones',uid),{estadoOp:e,horaCambioEstado:serverTimestamp(),ultimaConexion:serverTimestamp()});
  log({tipo:'estado',detalle:`Cambió a ${e}`,estado:e,por:uid!==user.uid?user.displayName:''},t);
 });
}
async function setMaquina(v){
 const [maq,proc='']=v.split(' - '),o=S.find(x=>x.rol==='montacarguista'&&x.maquina===maq&&x.uid!==user.uid);
 if(o){toast(`${maq} ya está en uso por ${o.displayName}`);return paint(true)}
 await guard(async()=>{
  await updateDoc(sesRef(),{maquina:maq,proceso:proc});
  await setDoc(doc(db,'usuarios',user.uid),{maquina:maq,proceso:proc},{merge:true});
  perfil.maquina=maq;perfil.proceso=proc;
  log({tipo:'maquina',detalle:`Cambió a la máquina ${maq}`},{uid:user.uid,displayName:user.displayName,rol:'montacarguista',maquina:maq});
 });
}
async function kick(uid){
 if(perfil.rol!=='supervisor'||uid===user.uid)return;
 const t=S.find(x=>x.uid===uid);if(!t||!confirm(`¿Desconectar a ${t.displayName}?`))return;
 await guard(async()=>{await updateDoc(doc(db,'sesiones',uid),{estado:'desconectado',forzado:true});log({tipo:'desconexion',detalle:'Desconectado por supervisor',por:user.displayName},t)});
}

/* =====================================================================
   VISTAS
   ===================================================================== */
function paint(force){
 if(!user||!perfil||!sessionReady)return;
 if(!force&&document.activeElement&&document.activeElement.tagName==='SELECT'){dirty=true;return} // no cerrar un desplegable abierto
 render();
}
function render(){
 $('tabs').innerHTML=TABS.map(([k,l])=>`<button class="tab ${k===view?'on':''}" data-v="${k}">${l}</button>`).join('');
 const mine=S.find(x=>x.uid===user.uid)||{uid:user.uid,displayName:user.displayName,rol:perfil.rol,maquina:perfil.maquina,estadoOp:'Disponible',photoURL:user.photoURL};
 $('view').innerHTML=({resumen:vResumen,supervisor:vSup,asistentes:vAsis,montacarguistas:vMon,historial:vHist}[view]||vResumen)(mine);
}
const row=(x,tag,extra='')=>`<div class="row"><div class="who">${pic(x,'sm')}<div><b>${esc(x.displayName)}</b><small>${tag?tag+' · ':''}Ingreso ${hm(x.horaIngreso)}${x.maquina?' · '+esc(x.maquina):''}</small></div></div><div>${bd(x.estadoOp)} ${extra}</div></div>`;
const kickBtn=x=>perfil.rol==='supervisor'&&x.uid!==user.uid?`<button class="dng" data-a="kick" data-u="${x.uid}">Desconectar</button>`:'';

// Tarjeta "Mi estado": botones grandes (1 activo a la vez) + máquina para montacarguista
function miCard(m){
 return `<div class="card"><h2>${ic('user')}Mi estado</h2>
 <div class="who">${pic(m)}<div><b>${esc(m.displayName)}</b><small>${RN[m.rol]}${m.maquina?' · '+esc(m.maquina):''}</small></div></div>
 <div class="conf">Estás en: ${bd(m.estadoOp)} <small>desde ${hm(m.horaCambioEstado)}</small></div>
 <div class="sts">${ESTADOS[m.rol].map(e=>`<button class="st ${e===m.estadoOp?'act':''}" style="--c:${COLOR[e]}" data-a="estado" data-u="${m.uid}" data-e="${e}">${e}</button>`).join('')}</div>
 ${m.rol==='montacarguista'?`<label>Mi montacarga</label><select data-a="maq">${MAQ.map(x=>`<option ${x.split(' - ')[0]===m.maquina?'selected':''}>${x}</option>`).join('')}</select>`:''}</div>`;
}

function vResumen(m){
 const sup=by('supervisor'),as=by('asistente'),mo=by('montacarguista'),disp=mo.filter(x=>x.estadoOp==='Disponible').length;
 return miCard(m)+`<div class="grid3">
 <button class="sum" data-v="supervisor"><small>${ic('shield')}SUPERVISOR A CARGO</small><b>${sup[0]?esc(sup[0].displayName):'Sin supervisor'}</b>${sup[0]?bd(sup[0].estadoOp):'<span class="muted">—</span>'}</button>
 <button class="sum" data-v="asistentes"><small>${ic('users')}ASISTENTES</small><b>${as.length}/${MAX_ASIS} conectados</b><span class="muted">Toca para ver detalle</span></button>
 <button class="sum" data-v="montacarguistas"><small>${ic('truck')}MONTACARGUISTAS</small><b>${mo.length} conectados</b><span class="muted">${disp} disponibles</span></button></div>`
 +(perfil.rol==='supervisor'?'<button class="full blk" data-a="estatus">'+ic('clip')+'ESTATUS</button>':'');
}

function vSup(){
 const l=by('supervisor');
 let h=`<div class="card"><h2>${ic('shield')}Supervisor a cargo</h2>${l.length?l.map((x,i)=>row(x,i?'Conectado':'<b>A CARGO</b>')).join(''):'<p class="muted">Sin supervisor conectado</p>'}</div>`;
 if(perfil.rol==='supervisor'){
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
 const body=l.map(x=>`<tr><td><b>${esc(x.maquina)}</b></td><td>${esc(x.proceso||'—')}</td><td>${esc(x.displayName)}</td>
  <td>${canEdit(x)?`<select data-a="estadoSel" data-u="${x.uid}" style="border-left:6px solid ${COLOR[x.estadoOp]}">${ESTADOS.montacarguista.map(e=>`<option ${e===x.estadoOp?'selected':''}>${e}</option>`).join('')}</select>`:bd(x.estadoOp)}</td>
  <td>Ingreso ${hm(x.horaIngreso)}<br><small>${esc(x.estadoOp)} desde ${hm(x.horaCambioEstado)}</small></td>
  <td>${x.celular?`<a class="btn" style="min-height:48px;padding:0 14px" href="tel:+51${esc(x.celular)}">${ic('phone')}</a>`:''} ${kickBtn(x)}</td></tr>`).join('');
 return (m.rol==='montacarguista'?miCard(m):'')+`<div class="card"><h2>${ic('truck')}Montacarguistas (${l.length})</h2><div class="tw"><table><thead><tr><th>MÁQUINA</th><th>PROCESO</th><th>NOMBRE</th><th>ESTADO</th><th>HORARIO</th><th>LLAMAR</th></tr></thead><tbody>${body||'<tr><td colspan="6" class="muted">Sin montacarguistas conectados</td></tr>'}</tbody></table></div></div>`;
}

function vHist(){
 const items=H.map(h=>`<li><time>${hm(h.timestamp)}</time><span class="dot" style="--c:${COLOR[h.estado]||'#64748b'}"></span><div><b>${esc(h.nombre)}</b> <small>${RN[h.rol]||''}${h.maquina?' · '+esc(h.maquina):''}</small><br>${esc(h.detalle)}${h.por?` <small>(por ${esc(h.por)})</small>`:''}</div></li>`).join('');
 return `<div class="card"><h2>Historial ${dia===hoy()?'de hoy':dia}</h2>
 ${perfil.rol==='supervisor'?`<label>Ver otro día (historial completo)</label><input type="date" data-a="dia" value="${dia}">`:''}
 <ul class="tl">${items||'<li class="muted">Sin movimientos</li>'}</ul></div>`;
}

/* =====================================================================
   REPORTE ESTATUS (supervisor) + WhatsApp
   ===================================================================== */
function estText(){
 const f=new Intl.DateTimeFormat('en-US',{timeZone:'America/Lima',hour12:false,hour:'2-digit',day:'2-digit',month:'short',year:'2-digit'}).formatToParts(new Date()),g=t=>f.find(x=>x.type===t).value;
 const h=+g('hour')%24,t=h>=6&&h<14?'T1':h>=14&&h<22?'T2':'T3',pad=n=>String(n).padStart(2,'0');
 const ab=n=>{const w=String(n).trim().split(/\s+/);return w[0][0].toUpperCase()+'. '+(w.length>=4?w[2]:w[Math.min(1,w.length-1)])};
 const code=x=>String(x.maquina).replace(/^FG-?/,'');
 const as=by('asistente'),mo=by('montacarguista').sort((a,b)=>code(a).localeCompare(code(b)));
 return `*ASISTENCIA ${t}*\n*${g('day')+g('month').toUpperCase()+g('year')}*\n*Supervisor*\n${user.displayName}\n\n*Asistentes ${pad(as.length)}/${pad(+$('ea').value||0)}*\n${as.map(x=>x.displayName).join('\n')}\n\n*Montacarguistas ${pad(mo.length)}/${pad(+$('em').value||0)}*\n${mo.map(x=>`FG-${code(x)}. ${ab(x.displayName)}`).join('\n')}`;
}
function estatus(){
 $('modal').hidden=false;
 $('modal').innerHTML=`<div class="mbox"><h2>${ic('clip')}ESTATUS</h2><label>Asistentes esperados</label><input id="ea" type="number" value="2" min="0"><label>Montacarguistas esperados</label><input id="em" type="number" value="8" min="0"><textarea id="et"></textarea>
 <button class="full" data-a="copy">${ic('copy')}Copiar Texto</button><button class="full blk" data-a="wa">${ic('send')}Enviar por WhatsApp</button>
 <input id="ec" type="tel" inputmode="numeric" maxlength="9" placeholder="Celular (9 dígitos)"><button class="full" data-a="wan">${ic('phone')}Enviar a número específico</button><button class="full" data-a="close">Cerrar</button></div>`;
 const up=()=>$('et').value=estText();up();$('ea').oninput=$('em').oninput=up;
}

/* =====================================================================
   EVENTOS (delegación)
   ===================================================================== */
$('gbtn').onclick=login;
$('hbtn').onclick=e=>{e.stopPropagation();if(!$('hbtn').dataset.logged)return;const m=$('menu');m.hidden=!m.hidden;$('hbtn').setAttribute('aria-expanded',!m.hidden)};
document.addEventListener('click',async ev=>{
 if(!ev.target.closest('#menu,#hbtn'))$('menu').hidden=true;
 const v=ev.target.closest('[data-v]');
 if(v){view=v.dataset.v;location.hash=view;render();return}
 const b=ev.target.closest('button[data-a]');if(!b)return;
 const a=b.dataset.a,d=b.dataset;$('menu').hidden=true;
 if(a==='perfil')perfilModal();
 else if(a==='rol')roleModal(true);
 else if(a==='logout')logout(!!perfil);
 else if(a==='close')$('modal').hidden=true;
 else if(a==='role')roleForm(d.r,!!perfil);
 else if(a==='roles')roleModal(!!d.c);
 else if(a==='rolOk')rolOk(d.r);
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
addEventListener('hashchange',()=>{const h=location.hash.slice(1);if(user&&perfil&&TABS.some(t=>t[0]===h)){view=h;render()}});

function perfilModal(){
 $('modal').hidden=false;
 $('modal').innerHTML=`<div class="mbox"><h2>Mi perfil</h2><div class="who">${pic(user)}<div><b>${esc(user.displayName)}</b><small>${esc(user.email)}</small></div></div>
 <div class="row"><span>Rol</span><b>${perfil?RN[perfil.rol]:'—'}</b></div>
 ${perfil&&perfil.maquina?`<div class="row"><span>Montacarga</span><b>${esc(perfil.maquina)} ${esc(perfil.proceso||'')}</b></div>`:''}
 ${perfil&&perfil.celular?`<div class="row"><span>Celular</span><b>${esc(perfil.celular)}</b></div>`:''}
 <button class="full" data-a="close">Cerrar</button></div>`;
}
$('hav').innerHTML=ic('user');hdr();
