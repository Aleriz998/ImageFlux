import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaType,safeSource,validateProject,connect} from '../model.js';
const node=(id)=>({id,type:'image',title:id,x:0,y:10,width:280,src:'data:image/png;base64,YQ=='});
test('recognizes animated images and video URLs with query strings',()=>{
  assert.equal(mediaType('https://example.org/clip.GIF?x=2'),'image');
  assert.equal(mediaType('https://example.org/clip.mp4#t=1'),'video');
  assert.equal(mediaType('video/webm'),'video');
  assert.equal(mediaType('text/html'),null);
});
test('rejects executable and unsupported URLs',()=>{
  assert.equal(safeSource('javascript:alert(1)'),false);
  assert.equal(safeSource('data:text/html;base64,YQ=='),false);
  assert.equal(safeSource('https://example.org/a.gif'),true);
});
test('project round trip preserves media and relations',()=>{
  const nodes=[node('a'),node('b')];
  const edges=[connect(nodes,[],'a','b')];
  const project={version:1,nodes,edges};
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))),project);
});
test('connections require existing distinct nodes and cannot be duplicated',()=>{
  const nodes=[node('a'),node('b')];
  assert.equal(connect(nodes,[],'a','a'),null);
  assert.equal(connect(nodes,[],'a','missing'),null);
  const edge=connect(nodes,[],'a','b');
  assert.equal(connect(nodes,[edge],'a','b'),null);
});
test('invalid imports are rejected without accepting orphaned edges',()=>{
  assert.throws(()=>validateProject({version:1,nodes:[node('a'),node('a')],edges:[]}));
  assert.throws(()=>validateProject({version:1,nodes:[node('a')],edges:[{id:'e',from:'a',to:'b'}]}));
  assert.throws(()=>validateProject({version:1,nodes:[{...node('a'),width:-10}],edges:[]}));
  assert.throws(()=>validateProject({version:1,nodes:[{...node('a'),src:'javascript:alert(1)'}],edges:[]}));
});
