import { mediaType, safeSource, validateProject, connect } from './model.js';

const $ = id => document.getElementById(id);
const viewport = $('viewport');
const world = $('world');
let state = { version: 1, name: 'Senza titolo', nodes: [], edges: [], camera: { x: 0, y: 0, scale: 1 } };
let selected = null;
let tool = 'select';
let source = null;
let gesture = null;
let db;
let saveTimer;
let toastTimer;
let saveQueue = Promise.resolve();
let hydrating = true;
let dragDepth = 0;
const elements = new Map();
const uid = () => crypto.randomUUID();
const icons = {
  'select-tool': '<path d="m5 3 14 10-7 1-3 7z"/>',
  'connect-tool': '<rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="16" width="5" height="5" rx="1"/><path d="M8 5h6a4 4 0 0 1 4 4v7M15 13l3 3 3-3"/>',
  'add-media': '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  'add-url': '<path d="M14 3h7v7M21 3 10 14M10 5H6a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-4"/>',
  'fit': '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
};
for (const [id, paths] of Object.entries(icons)) {
  $(id).innerHTML = `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').hidden = true, 4800);
}
function changed() {
  if (hydrating) return;
  $('save-status').textContent = 'Salvataggio…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}
function save() {
  if (!db) { $('save-status').textContent = 'Esporta per salvare'; return; }
  const snapshot = structuredClone(state);
  saveQueue = saveQueue.catch(() => {}).then(() => new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').put(snapshot, 'current');
    tx.oncomplete = () => { $('save-status').textContent = '✓ Salvato nel browser'; resolve(); };
    tx.onerror = () => { $('save-status').textContent = 'Salvataggio non riuscito'; toast('Spazio locale esaurito o non disponibile. Esporta il progetto per conservarlo.'); reject(tx.error); };
  }));
  saveQueue.catch(() => {});
}
function point(clientX, clientY) {
  const r = viewport.getBoundingClientRect();
  return { x: (clientX - r.left - state.camera.x) / state.camera.scale, y: (clientY - r.top - state.camera.y) / state.camera.scale };
}
function center() {
  const r = viewport.getBoundingClientRect();
  return point(r.left + r.width / 2 - 130, r.top + r.height / 2 - 110);
}
function camera() {
  const c = state.camera;
  world.style.transform = `translate(${c.x}px,${c.y}px) scale(${c.scale})`;
  viewport.style.backgroundPosition = `${c.x}px ${c.y}px`;
  viewport.style.backgroundSize = `${24 * c.scale}px ${24 * c.scale}px`;
  $('zoom-level').textContent = `${Math.round(c.scale * 100)}%`;
}
function zoom(scale, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
  const c = state.camera;
  const next = Math.max(.15, Math.min(3, scale));
  c.x = x - (x - c.x) * next / c.scale;
  c.y = y - (y - c.y) * next / c.scale;
  c.scale = next;
  camera(); changed();
}
function fit() {
  if (!state.nodes.length) { state.camera = {x:0,y:0,scale:1}; camera(); changed(); return; }
  const bounds = state.nodes.map(n => ({ x:n.x,y:n.y,w:n.width,h:elements.get(n.id)?.offsetHeight || 200 }));
  const minX = Math.min(...bounds.map(b => b.x)), minY = Math.min(...bounds.map(b => b.y));
  const maxX = Math.max(...bounds.map(b => b.x + b.w)), maxY = Math.max(...bounds.map(b => b.y + b.h));
  const scale = Math.max(.15, Math.min(1.25, (viewport.clientWidth - 140) / (maxX-minX), (viewport.clientHeight - 170) / (maxY-minY)));
  state.camera = { scale, x:(viewport.clientWidth-(maxX-minX)*scale)/2-minX*scale, y:(viewport.clientHeight-(maxY-minY)*scale)/2-minY*scale };
  camera(); changed();
}
function setTool(next) {
  tool = next; source = null;
  document.body.classList.toggle('connecting', next === 'connect');
  $('select-tool').classList.toggle('active', next === 'select');
  $('connect-tool').classList.toggle('active', next === 'connect');
  $('select-tool').setAttribute('aria-pressed', String(next === 'select'));
  $('connect-tool').setAttribute('aria-pressed', String(next === 'connect'));
  $('connection-hint').hidden = next !== 'connect';
  elements.forEach(el => el.classList.remove('connect-source'));
}
function select(id, kind = 'node') {
  selected = id ? { id, kind } : null;
  elements.forEach((el,key) => el.classList.toggle('selected', key === id && kind === 'node'));
  const item = kind === 'node' ? state.nodes.find(n => n.id === id) : state.edges.find(e => e.id === id);
  $('inspector').hidden = !item;
  if (!item) { drawEdges(); return; }
  $('item-title').value = kind === 'node' ? item.title : item.label || '';
  $('note-field').hidden = kind !== 'node' || item.type !== 'note';
  $('width-field').hidden = kind !== 'node';
  if (kind === 'node') { $('item-width').value = item.width; $('note-text').value = item.text || ''; }
  $('selection-info').textContent = kind === 'edge' ? 'Collegamento direzionale. Modifica il titolo per descrivere la relazione.' : item.type === 'note' ? 'Una nota per dare contesto alle tue idee.' : item.src.startsWith('data:') ? 'File incluso nel progetto e nel salvataggio locale.' : 'Media esterno: richiede accesso al sito di origine.';
  $('delete-selection').textContent = kind === 'edge' ? 'Elimina collegamento' : 'Elimina elemento';
  drawEdges();
}
const observer = new ResizeObserver(() => drawEdges());
function positionNode(n) {
  const el = elements.get(n.id);
  el.style.left = `${n.x}px`; el.style.top = `${n.y}px`; el.style.width = `${n.width}px`;
}
function createNode(n) {
  const el = document.createElement('article');
  el.className = `node ${n.type}`; el.dataset.id = n.id;
  el.setAttribute('aria-label', n.title);
  const head = document.createElement('div'); head.className = 'node-header';
  const title = document.createElement('span'); title.className = 'node-title'; title.textContent = n.title;
  const badge = document.createElement('span'); badge.className = 'node-badge'; badge.textContent = n.type === 'note' ? 'NOTA' : n.type === 'video' ? 'VIDEO' : /gif/i.test(n.src.slice(0,50)) ? 'GIF' : 'IMAGE';
  head.append(title,badge); el.append(head);
  if (n.type === 'note') {
    const body = document.createElement('div'); body.className = 'note-body'; body.textContent = n.text; el.append(body);
  } else {
    const wrap = document.createElement('div'); wrap.className = 'media-wrap';
    const media = document.createElement(n.type === 'video' ? 'video' : 'img');
    if (n.type === 'video') { media.controls = true; media.preload = 'metadata'; media.playsInline = true; }
    else { media.alt = n.title; media.draggable = false; }
    media.addEventListener('error', () => {
      const error = document.createElement('div'); error.className = 'media-error';
      error.textContent = 'Media non disponibile. Controlla il link, l’accesso al sito o il formato supportato dal browser.';
      const retry = document.createElement('button'); retry.textContent = 'Riprova';
      retry.onclick = () => { error.remove(); media.hidden = false; media.src = n.src; if (n.type === 'video') media.load(); };
      error.append(retry); wrap.querySelector('.media-error')?.remove(); wrap.append(error); media.hidden = true;
    });
    media.src = n.src; wrap.append(media); el.append(wrap);
  }
  const port = document.createElement('button'); port.className = 'port'; port.title = 'Trascina per collegare'; port.setAttribute('aria-label','Collega questo nodo');
  const resize = document.createElement('button'); resize.className = 'resize'; resize.setAttribute('aria-label','Ridimensiona nodo');
  el.append(port,resize); $('nodes').append(el); elements.set(n.id,el); positionNode(n); observer.observe(el);
}
function render() {
  observer.disconnect(); elements.clear(); $('nodes').replaceChildren();
  for (const n of state.nodes) createNode(n);
  $('empty-state').hidden = state.nodes.length > 0;
  $('board-count').textContent = `${state.nodes.length} elementi · ${state.edges.length} collegamenti`;
  $('project-name').value = state.name;
  camera(); drawEdges();
}
function drawEdges() {
  const layer = $('edge-layer'); layer.replaceChildren();
  for (const e of state.edges) {
    const a = state.nodes.find(n=>n.id === e.from), b = state.nodes.find(n=>n.id === e.to);
    if (!a || !b) continue;
    const ax = a.x + a.width, ay = a.y + (elements.get(a.id)?.offsetHeight || 200)/2;
    const bx = b.x, by = b.y + (elements.get(b.id)?.offsetHeight || 200)/2;
    const bend = Math.max(70, Math.abs(bx-ax)*.45);
    const d = `M ${ax} ${ay} C ${ax+bend} ${ay}, ${bx-bend} ${by}, ${bx} ${by}`;
    for (const hit of [true,false]) {
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',d); path.setAttribute('class',hit ? 'edge-hit' : `edge${selected?.id === e.id ? ' selected' : ''}`);
      if (!hit) path.setAttribute('marker-end','url(#arrow)');
      path.addEventListener('pointerdown', ev => ev.stopPropagation());
      path.addEventListener('click', () => select(e.id,'edge')); layer.append(path);
    }
    if (e.label) {
      const text = document.createElementNS('http://www.w3.org/2000/svg','text');
      text.setAttribute('x',(ax+bx)/2); text.setAttribute('y',(ay+by)/2-10); text.setAttribute('text-anchor','middle'); text.setAttribute('class','edge-label'); text.textContent = e.label;
      text.addEventListener('pointerdown', ev=>ev.stopPropagation()); text.addEventListener('click',()=>select(e.id,'edge')); layer.append(text);
    }
  }
}
function addNode(type, src, title, pos = center(), text = '') {
  const n = {id:uid(),type,src,title,x:pos.x,y:pos.y,width:type === 'note' ? 240 : 280,text};
  state.nodes.push(n); createNode(n); $('empty-state').hidden = true; updateCount(); changed(); return n;
}
function updateCount() { $('board-count').textContent = `${state.nodes.length} elementi · ${state.edges.length} collegamenti`; }
function addConnection(from,to) {
  const e = connect(state.nodes,state.edges,from,to);
  if (e) { state.edges.push(e); drawEdges(); updateCount(); changed(); toast('Collegamento creato. Clicca la freccia per aggiungere un’etichetta.'); }
}
function removeSelected() {
  if (!selected) return;
  if (selected.kind === 'node') {
    const el = elements.get(selected.id); if (el) { observer.unobserve(el); el.querySelector('video')?.pause(); el.remove(); elements.delete(selected.id); }
    state.nodes = state.nodes.filter(n=>n.id !== selected.id);
    state.edges = state.edges.filter(e=>e.from !== selected.id && e.to !== selected.id);
  } else state.edges = state.edges.filter(e=>e.id !== selected.id);
  select(null); $('empty-state').hidden = state.nodes.length > 0; updateCount(); changed();
}
viewport.addEventListener('pointerdown', ev => {
  if (ev.button !== 0 && ev.button !== 1) return;
  if (ev.target.closest('button,video') && !ev.target.closest('.port,.resize')) return;
  const el = ev.target.closest('.node');
  const p = point(ev.clientX,ev.clientY);
  if (el) {
    const n = state.nodes.find(n=>n.id === el.dataset.id);
    if (ev.target.closest('.port')) {
      source = n.id; el.classList.add('connect-source'); gesture = {kind:'connect',id:n.id};
    } else if (tool === 'connect') {
      if (source) { addConnection(source,n.id); setTool('connect'); }
      else { source = n.id; el.classList.add('connect-source'); }
      return;
    } else {
      select(n.id);
      gesture = ev.target.closest('.resize') ? {kind:'resize',id:n.id,x:p.x,width:n.width} : {kind:'move',id:n.id,dx:p.x-n.x,dy:p.y-n.y};
    }
  } else {
    select(null); gesture = {kind:'pan',x:ev.clientX,y:ev.clientY,cx:state.camera.x,cy:state.camera.y};
  }
  ev.preventDefault(); viewport.setPointerCapture(ev.pointerId);
});
viewport.addEventListener('pointermove', ev => {
  if (!gesture) return;
  const p = point(ev.clientX,ev.clientY);
  if (gesture.kind === 'pan') {
    state.camera.x = gesture.cx + ev.clientX - gesture.x; state.camera.y = gesture.cy + ev.clientY - gesture.y; camera();
  } else if (gesture.kind === 'move' || gesture.kind === 'resize') {
    const n = state.nodes.find(n=>n.id===gesture.id);
    if (gesture.kind === 'move') { n.x = p.x-gesture.dx; n.y=p.y-gesture.dy; }
    else n.width=Math.max(160,Math.min(1000,gesture.width+p.x-gesture.x));
    positionNode(n); drawEdges();
  } else {
    drawEdges();
    const n = state.nodes.find(n=>n.id===gesture.id);
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',`M ${n.x+n.width} ${n.y+elements.get(n.id).offsetHeight/2} L ${p.x} ${p.y}`);
    path.setAttribute('class','edge'); path.style.strokeDasharray='6 5'; $('edge-layer').append(path);
  }
});
function finishGesture(ev) {
  if (!gesture) return;
  if (gesture.kind === 'connect' && ev.type !== 'pointercancel') {
    const target = document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.node');
    if (target) addConnection(gesture.id,target.dataset.id);
    source = null; elements.forEach(el=>el.classList.remove('connect-source')); drawEdges();
  }
  gesture=null; if (viewport.hasPointerCapture(ev.pointerId)) viewport.releasePointerCapture(ev.pointerId); changed();
}
viewport.addEventListener('pointerup',finishGesture); viewport.addEventListener('pointercancel',finishGesture);
viewport.addEventListener('wheel', ev => {
  if (ev.target.closest('video')) return;
  ev.preventDefault(); const r=viewport.getBoundingClientRect(); zoom(state.camera.scale*Math.exp(-ev.deltaY*.0015),ev.clientX-r.left,ev.clientY-r.top);
},{passive:false});

async function importFiles(files,pos=center()) {
  const supported = [...files].filter(f=>mediaType(f.type) || mediaType(f.name));
  if (!supported.length) { toast('Scegli immagini, GIF o video.'); return; }
  if (supported.length < files.length) toast('Alcuni file non sono immagini o video e sono stati ignorati.');
  let index=0;
  for (const file of supported) {
    if (file.size > 80*1024*1024) { toast(`${file.name}: il limite per file è 80 MB.`); continue; }
    try {
      const mimeByExtension = {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',svg:'image/svg+xml',bmp:'image/bmp',mp4:'video/mp4',webm:'video/webm',ogg:'video/ogg',mov:'video/quicktime',m4v:'video/mp4'};
      const mime = mediaType(file.type) ? file.type : mimeByExtension[file.name.split('.').pop().toLowerCase()];
      const content = mime ? new Blob([file], {type:mime}) : file;
      const src = await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(content);});
      const n=addNode(mediaType(file.type)||mediaType(file.name),src,file.name,{x:pos.x+(index%3)*320,y:pos.y+Math.floor(index/3)*300});
      select(n.id); index++;
    } catch { toast(`Impossibile leggere ${file.name}`); }
  }
}
function importUrl(url,pos=center(),type='auto') {
  if (/^data:/i.test(url) && safeSource(url)) {
    const kind = url.startsWith('data:video/') ? 'video' : 'image';
    const n = addNode(kind,url,'Media dal browser',pos); select(n.id); return true;
  }
  if (!/^https?:\/\//i.test(url) || !safeSource(url)) { toast('Usa un indirizzo HTTP o HTTPS diretto al media.'); return false; }
  let parsed; try { parsed=new URL(url); } catch { toast('Indirizzo non valido.'); return false; }
  const kind=type==='auto' ? mediaType(parsed.pathname)||'image' : type;
  let title=parsed.pathname.split('/').pop() || parsed.hostname;
  try { title=decodeURIComponent(title); } catch {}
  const n=addNode(kind,url,title,pos); select(n.id); return true;
}
viewport.addEventListener('dragenter',ev=>{ev.preventDefault();dragDepth++;$('drop-overlay').classList.add('visible');});
viewport.addEventListener('dragover',ev=>{ev.preventDefault();ev.dataTransfer.dropEffect='copy';});
viewport.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('drop-overlay').classList.remove('visible');}});
viewport.addEventListener('drop',async ev=>{
  ev.preventDefault();dragDepth=0;$('drop-overlay').classList.remove('visible');
  const pos=point(ev.clientX,ev.clientY);
  if(ev.dataTransfer.files.length) return importFiles(ev.dataTransfer.files,pos);
  const html=ev.dataTransfer.getData('text/html');
  const doc=html ? new DOMParser().parseFromString(html,'text/html') : null;
  const url=doc?.querySelector('img')?.getAttribute('src') || ev.dataTransfer.getData('text/uri-list').split('\n').find(l=>l && !l.startsWith('#')) || ev.dataTransfer.getData('text/plain').trim();
  if(url) importUrl(url,pos); else toast('Trascina un file o un’immagine con un URL accessibile.');
});
document.addEventListener('paste',ev=>{
  if(isEditing(ev.target))return;
  const files=[...ev.clipboardData.items].filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter(Boolean);
  if(files.length){ev.preventDefault();importFiles(files);return;}
  const value=ev.clipboardData.getData('text/plain').trim();
  if(/^https?:\/\//i.test(value)){ev.preventDefault();importUrl(value);}
});
function isEditing(target){return target.closest('input,textarea,select,[contenteditable=true]') || document.querySelector('dialog[open]');}
document.addEventListener('keydown',ev=>{
  if(isEditing(ev.target))return;
  if(ev.metaKey||ev.ctrlKey||ev.altKey)return;
  if(ev.key==='Delete'||ev.key==='Backspace'){ev.preventDefault();removeSelected();}
  if(ev.key.toLowerCase()==='c')setTool('connect');
  if(ev.key.toLowerCase()==='v')setTool('select');
  if(ev.key.toLowerCase()==='n')addNote();
  if(ev.key.toLowerCase()==='f')fit();
  if(ev.key==='Escape'){setTool('select');select(null);}
});
function addNote(){ const n=addNode('note','', 'Una nuova idea',center(),'Scrivi un’idea, un riferimento o il prossimo passo.');select(n.id);$('note-text').focus(); }
$('select-tool').onclick=()=>setTool('select'); $('connect-tool').onclick=()=>setTool(tool==='connect'?'select':'connect');
$('add-note').onclick=addNote;
$('add-media').onclick=$('empty-add').onclick=()=>$('file-input').click();
$('file-input').onchange=async ev=>{await importFiles(ev.target.files);ev.target.value='';};
$('add-url').onclick=()=>$('url-dialog').showModal();
$('cancel-url').onclick=()=>$('url-dialog').close();
$('url-form').onsubmit=ev=>{ev.preventDefault();if(importUrl($('media-url').value.trim(),center(),$('url-type').value)){ $('url-dialog').close();$('url-form').reset(); }};
$('help').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();
$('zoom-in').onclick=()=>zoom(state.camera.scale*1.2);$('zoom-out').onclick=()=>zoom(state.camera.scale/1.2);$('fit').onclick=fit;
$('close-inspector').onclick=()=>select(null);$('delete-selection').onclick=removeSelected;
$('project-name').oninput=ev=>{state.name=ev.target.value;changed();};
$('item-title').oninput=ev=>{
  if(!selected)return;
  if(selected.kind==='edge'){state.edges.find(e=>e.id===selected.id).label=ev.target.value;drawEdges();}
  else { const n=state.nodes.find(n=>n.id===selected.id);n.title=ev.target.value;const el=elements.get(n.id);el.querySelector('.node-title').textContent=n.title;el.setAttribute('aria-label',n.title);const img=el.querySelector('img');if(img)img.alt=n.title; }
  changed();
};
$('note-text').oninput=ev=>{const n=state.nodes.find(n=>n.id===selected?.id);if(n?.type==='note'){n.text=ev.target.value;elements.get(n.id).querySelector('.note-body').textContent=n.text;changed();}};
$('item-width').oninput=ev=>{const n=state.nodes.find(n=>n.id===selected?.id);if(n){n.width=Number(ev.target.value);positionNode(n);drawEdges();changed();}};
$('export-project').onclick=()=>{
  const blob=new Blob([JSON.stringify(state)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${(state.name || 'ImageFlux').replace(/[^\p{L}\p{N}_-]/gu,'_')}.imageflux`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Progetto esportato con i file locali inclusi.');
};
$('open-project').onclick=()=>$('project-input').click();
$('project-input').onchange=async ev=>{
  const file=ev.target.files[0];if(!file)return;
  try {
    if(file.size>500*1024*1024)throw new Error('Il progetto supera il limite di 500 MB');
    const project=validateProject(JSON.parse(await file.text()));
    if(state.nodes.length && !window.confirm('Sostituire la board attuale? Esporta prima il progetto se vuoi conservarlo.'))return;
    applyProject(project);changed();toast('Progetto aperto.');
  }catch(error){toast(`Impossibile aprire il progetto: ${error.message}`);}
  finally{ev.target.value='';}
};
function applyProject(project){
  state={version:1,name:typeof project.name==='string'?project.name:'Senza titolo',nodes:project.nodes,edges:project.edges,camera:{x:0,y:0,scale:1}};
  const c=project.camera;if(c&&Number.isFinite(c.x)&&Number.isFinite(c.y)&&Number.isFinite(c.scale)&&c.scale>=.15&&c.scale<=3)state.camera=c;
  selected=null;setTool('select');$('inspector').hidden=true;render();
}
$('load-demo').onclick=()=>{
  const art=(a,b,label)=>'data:image/svg+xml;base64,'+btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="560" height="380"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="560" height="380" fill="url(#g)"/><circle cx="320" cy="170" r="115" fill="none" stroke="#ffffff55" stroke-width="1"/><circle cx="320" cy="170" r="80" fill="#ffffff15"/><path d="M0 320L140 130 270 320 430 80 560 320V380H0" fill="#0d181b77"/><text x="30" y="45" fill="#ffffffaa" font-size="13" font-family="sans-serif" letter-spacing="4">${label}</text></svg>`);
  const a=addNode('image',art('#5f7461','#172e35','01 / ATMOSPHERE'),'Atmosfera · quiete',{x:80,y:100});
  const b=addNode('image',art('#c4a586','#624e52','02 / PALETTE'),'Palette · toni naturali',{x:480,y:100});
  const c=addNode('note','','Direzione creativa',{x:880,y:140},'Una pausa dal rumore.\n\nColori organici, forme essenziali e spazio per respirare.');
  state.edges.push({...connect(state.nodes,state.edges,a.id,b.id),label:'ispira'}, {...connect(state.nodes,state.edges,b.id,c.id),label:'definisce'});drawEdges();updateCount();requestAnimationFrame(fit);changed();
};
async function init(){
  try {
    db=await new Promise((resolve,reject)=>{const req=indexedDB.open('imageflux',1);req.onupgradeneeded=()=>req.result.createObjectStore('projects');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    const stored=await new Promise((resolve,reject)=>{const req=db.transaction('projects').objectStore('projects').get('current');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    if(stored)applyProject(validateProject(stored));
    $('save-status').textContent='✓ Salvato nel browser';
  }catch{toast('Salvataggio locale non disponibile. Usa Esporta per conservare il progetto.');$('save-status').textContent='Esporta per salvare';}
  finally{hydrating=false;render();}
}
render();init();
