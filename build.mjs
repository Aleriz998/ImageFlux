import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';

const root = new URL('./', import.meta.url);
const output = new URL('./dist/', root);
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'style.css', 'app.js', 'model.js']) {
  await copyFile(new URL(name, root), new URL(name, output));
}
await writeFile(new URL('.nojekyll', output), '');
const [html, css, model, app] = await Promise.all(
  ['index.html', 'style.css', 'model.js', 'app.js'].map(name => readFile(new URL(name, root), 'utf8')),
);
const standalone = html
  .replace('href="./" aria-label="ImageFlux"', 'href="#" aria-label="ImageFlux"')
  .replace('<link rel="stylesheet" href="./style.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="./app.js"></script>', () =>
    `<script type="module">\n${model.replace(/^export /gm, '')}\n${app.replace(/^import .* from '\.\/model\.js';\n/, '')}\n</script>`);
await writeFile(new URL('ImageFlux.html', output), standalone);
console.log('Sito statico in dist/; versione senza installazione: dist/ImageFlux.html');
