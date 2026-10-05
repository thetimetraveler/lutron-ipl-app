import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request } from 'node:http';
import { connect } from 'node:net';
import { createExplorer } from '../src/explorer.js';
import { startExplorerServer, allowedExplorerPeer } from '../src/explorer-server.js';
import type { AppConfig } from '../src/contracts.js';
const config={mappings:[],credential_dir:'/nonexistent',metadata_file:'',name_overrides:[],base_topic:'test',instance_id:'synthetic'} as unknown as AppConfig;
function get(port:number,path:string,method='GET',headers:Record<string,string>={}) {return new Promise<{status:number;headers:any;body:string}>((resolve,reject)=>{const req=request({host:'127.0.0.1',port,path,method,headers},res=>{let body='';res.on('data',data=>body+=data);res.on('end',()=>resolve({status:res.statusCode!,headers:res.headers,body}));});req.on('error',reject);req.end();});}
test('only actual ingress and loopback peers are allowed',()=>{
 for(const peer of ['172.30.32.2','::ffff:172.30.32.2','127.0.0.1','127.1.2.3','::1','::ffff:127.0.0.1'])assert.equal(allowedExplorerPeer(peer),true,peer);
 for(const peer of ['172.30.32.3','192.0.2.1','::ffff:192.0.2.1',undefined])assert.equal(allowedExplorerPeer(peer),false,peer);
});
test('relative assets, security headers, snapshot validation, GET-only and traversal denial',async t=>{
 const explorer=createExplorer(config);const server=await startExplorerServer(explorer,{host:'127.0.0.1',port:0});t.after(()=>server.stop());
 const home=await get(server.port,'/');assert.equal(home.status,200);assert.match(home.body,/\.\/app\.js/);assert.match(home.body,/\.\/style\.css/);assert.equal(home.headers['cache-control'],'no-store');assert.match(home.headers['content-security-policy'],/default-src 'none'/);assert.match(home.headers['content-security-policy'],/frame-ancestors 'self'/);
 for(const path of ['/app.js','/style.css','/api/snapshot?after=0'])assert.equal((await get(server.port,path)).status,200,path);
 for(const path of ['/api/snapshot?after=-1','/api/snapshot?after=1.5','/api/snapshot?after=9007199254740992','/api/snapshot?after=0&after=2','/api/snapshot?secret=x'])assert.equal((await get(server.port,path)).status,400,path);
 for(const path of ['/../main.js','/%2e%2e/main.js','/config','/api/snapshot/'])assert.equal((await get(server.port,path)).status,404,path);
 assert.equal((await get(server.port,'/api/snapshot','POST')).status,405);assert.equal((await get(server.port,'/','HEAD')).status,405);
 assert.equal((await get(server.port,'/api/snapshot')).body.includes('credential'),false);
});
test('proxy headers cannot allow denied peer and shutdown bounds slow open clients',async t=>{
 const explorer=createExplorer(config);const denied=await startExplorerServer(explorer,{host:'127.0.0.1',port:0,peerAddress:()=> '192.0.2.1'});t.after(()=>denied.stop());
 const res=await get(denied.port,'/api/snapshot','GET',{'x-forwarded-for':'172.30.32.2','x-real-ip':'127.0.0.1'});assert.equal(res.status,403);
 const server=await startExplorerServer(explorer,{host:'127.0.0.1',port:0,shutdownTimeoutMs:20});const socket=connect(server.port,'127.0.0.1');socket.on('error',()=>{});await new Promise<void>(resolve=>socket.once('connect',resolve));socket.write('GET / HTTP/1.1\r\nHost: example\r\n');
 const start=Date.now();await server.stop();assert.ok(Date.now()-start<500);socket.destroy();assert.equal(server.stop(),server.stop());
});

test('occupied bind fails with a fixed safe error and does not close the existing server',async t=>{
 const explorer=createExplorer(config);const original=await startExplorerServer(explorer,{host:'127.0.0.1',port:0});t.after(()=>original.stop());
 await assert.rejects(startExplorerServer(explorer,{host:'127.0.0.1',port:original.port}),error=>error instanceof Error && error.message==='Unable to bind event explorer HTTP server');
 assert.equal((await get(original.port,'/api/snapshot')).status,200);
});
