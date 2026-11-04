export function mediaType(value) {
  if (value.startsWith('image/')) return 'image';
  if (value.startsWith('video/')) return 'video';
  const path = value.split(/[?#]/)[0].toLowerCase();
  if (/\.(png|jpe?g|gif|webp|avif|svg|bmp)$/.test(path)) return 'image';
  if (/\.(mp4|webm|ogg|mov|m4v)$/.test(path)) return 'video';
  return null;
}

export function safeSource(source) {
  if (typeof source !== 'string') return false;
  return /^https?:\/\//i.test(source) || /^data:(image|video)\/[a-z0-9.+-]+;base64,/i.test(source);
}

export function validateProject(project) {
  if (!project || project.version !== 1 || !Array.isArray(project.nodes) || !Array.isArray(project.edges)) throw new Error('Formato progetto non valido');
  if (project.nodes.length > 2000 || project.edges.length > 10000) throw new Error('Progetto troppo grande');
  const ids = new Set();
  for (const n of project.nodes) {
    if (!n || typeof n.id !== 'string' || ids.has(n.id) || !['image', 'video', 'note'].includes(n.type) || typeof n.title !== 'string' || !Number.isFinite(n.x) || !Number.isFinite(n.y) || !Number.isFinite(n.width) || n.width < 140 || n.width > 2000) throw new Error('Nodo non valido');
    if (n.type !== 'note' && !safeSource(n.src)) throw new Error('Indirizzo multimediale non valido');
    if (n.type === 'note' && typeof n.text !== 'string') throw new Error('Nota non valida');
    ids.add(n.id);
  }
  for (const e of project.edges) {
    if (!e || typeof e.id !== 'string' || !ids.has(e.from) || !ids.has(e.to) || e.from === e.to || (e.label !== undefined && typeof e.label !== 'string')) throw new Error('Collegamento non valido');
  }
  return project;
}

export function connect(nodes, edges, from, to) {
  if (from === to || !nodes.some(n => n.id === from) || !nodes.some(n => n.id === to) || edges.some(e => e.from === from && e.to === to)) return null;
  return { id: crypto.randomUUID(), from, to, label: '' };
}
