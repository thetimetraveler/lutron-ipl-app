import { createServer, type IncomingMessage } from 'node:http';
import { isIP, type Socket } from 'node:net';
import type { Explorer } from './explorer.js';
import { EXPLORER_HTML, EXPLORER_JS, EXPLORER_CSS } from './explorer-ui.js';

/** Authorization uses the TCP peer only; forwarded headers never grant access. */
export function allowedExplorerPeer(address:string|undefined):boolean {
  if(!address)return false;
  const peer=address.startsWith('::ffff:')?address.slice(7):address;
  if(peer==='172.30.32.2'||peer==='::1')return true;
  return isIP(peer)===4 && peer.startsWith('127.');
}
export interface ExplorerServerOptions {
  host?:string;
  port?:number;
  /** Offline test seam: replaces the measured peer, never the authorization rule. */
  peerAddress?:(request:IncomingMessage)=>string|undefined;
  shutdownTimeoutMs?:number;
}
export async function startExplorerServer(explorer:Explorer,options:ExplorerServerOptions={}):Promise<{port:number;stop():Promise<void>}> {
  const sockets=new Set<Socket>();
  const security={
    'Cache-Control':'no-store',
    'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  };
  const server=createServer({maxHeaderSize:8192},(request,response)=>{
    // Every response, including denial/error responses, has the same safe policy.
    const send=(status:number,body:string,type='text/plain; charset=utf-8')=>{
      response.writeHead(status,{...security,'Content-Type':type,'Content-Length':Buffer.byteLength(body)});response.end(body);
    };
    try {
      const peer=options.peerAddress?options.peerAddress(request):request.socket.remoteAddress;
      if(!allowedExplorerPeer(peer)){send(403,'Forbidden');return;}
      if(request.method!=='GET'){response.setHeader('Allow','GET');send(405,'Method not allowed');return;}
      const target=request.url??'';
      // Parse the raw request target ourselves so normalized traversal is never an asset route.
      if(target.length>2048||!target.startsWith('/')||target.startsWith('//')||/[\\\u0000-\u0020]/.test(target)){send(404,'Not found');return;}
      const split=target.indexOf('?'),path=split<0?target:target.slice(0,split),query=split<0?'':target.slice(split+1);
      if(path==='/api/snapshot'){
        const params=new URLSearchParams(query),keys=[...params.keys()];
        if(keys.some(key=>key!=='after')||keys.length>1){send(400,'Invalid snapshot cursor');return;}
        const cursor=params.get('after');
        if(cursor!==null&&(!/^(0|[1-9][0-9]*)$/.test(cursor)||!Number.isSafeInteger(Number(cursor)))){send(400,'Invalid snapshot cursor');return;}
        send(200,JSON.stringify(explorer.snapshot(cursor===null?undefined:Number(cursor))),'application/json; charset=utf-8');return;
      }
      if(query){send(404,'Not found');return;}
      if(path==='/'){send(200,EXPLORER_HTML,'text/html; charset=utf-8');return;}
      if(path==='/app.js'){send(200,EXPLORER_JS,'text/javascript; charset=utf-8');return;}
      if(path==='/style.css'){send(200,EXPLORER_CSS,'text/css; charset=utf-8');return;}
      send(404,'Not found');
    } catch {send(500,'Explorer unavailable');}
  });
  // Bound headers, keepalive, request time, connection count and responses to stalled clients.
  server.headersTimeout=10_000;server.requestTimeout=15_000;server.keepAliveTimeout=5000;server.maxRequestsPerSocket=100;server.maxConnections=32;
  server.setTimeout(15_000,socket=>socket.destroy());
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
  server.on('clientError',(_error,socket)=>socket.destroy());
  try {
    await new Promise<void>((resolve,reject)=>{
      const fail=()=>{server.removeListener('listening',ready);reject(Error('Unable to bind event explorer HTTP server'));};
      const ready=()=>{server.removeListener('error',fail);resolve();};
      server.once('error',fail);server.once('listening',ready);server.listen(options.port??8099,options.host??'0.0.0.0');
    });
  } catch {for(const socket of sockets)socket.destroy();throw Error('Unable to bind event explorer HTTP server');}
  // Post-bind errors must not surface arbitrary socket/address details or crash observation.
  server.on('error',()=>{for(const socket of sockets)socket.destroy();});
  const address=server.address();if(!address||typeof address==='string')throw Error('Unable to bind event explorer HTTP server');
  let stopPromise:Promise<void>|undefined;
  return {port:address.port,stop(){
    if(stopPromise)return stopPromise;
    stopPromise=new Promise<void>(resolve=>{
      let complete=false;
      const finish=()=>{if(complete)return;complete=true;clearTimeout(timer);for(const socket of sockets)socket.destroy();resolve();};
      const timer=setTimeout(finish,options.shutdownTimeoutMs??1000);
      server.close(finish);server.closeIdleConnections();
    });return stopPromise;
  }};
}
