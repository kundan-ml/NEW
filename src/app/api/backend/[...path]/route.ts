import {NextRequest,NextResponse} from 'next/server';

export const dynamic='force-dynamic';
export const runtime='nodejs';

type RouteContext={params:Promise<{path:string[]}>};
const HOP_BY_HOP=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
const REQUEST_HEADERS=['accept','accept-language','authorization','content-type','cookie','if-match','if-none-match','if-modified-since','if-unmodified-since','range','if-range'];

function validPath(path:string[]):boolean{
  return path.length>0&&path.length<=32&&path.every(segment=>segment.length>0&&segment.length<=512
    &&segment!=='.'&&segment!=='..'&&!/[\\/%\x00-\x1f\x7f]/.test(segment));
}

function configuredBackend():URL{
  const base=new URL(process.env.BACKEND_API_URL||process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000/api/v1');
  if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash)throw new Error('Invalid backend configuration');
  base.pathname=base.pathname.replace(/\/+$/,'');
  return base;
}

async function proxy(req:NextRequest,context:RouteContext):Promise<Response>{
  const {path}=await context.params;
  if(!Array.isArray(path)||!validPath(path))return NextResponse.json({detail:'Invalid backend API path'},{status:400});
  // Browser uploads are multipart forms, so also protect this same-origin
  // mutation endpoint from cross-site form submissions without changing auth.
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.get('sec-fetch-site')==='cross-site'){
    return NextResponse.json({detail:'Cross-site backend requests are not allowed'},{status:403});
  }
  try{
    const base=configuredBackend();
    const target=new URL(`${base.toString().replace(/\/+$/,'')}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`);
    const headers=new Headers();
    for(const name of REQUEST_HEADERS){const value=req.headers.get(name);if(value!==null)headers.set(name,value);}
    const options:RequestInit&{duplex?:'half'}={method:req.method,headers,signal:req.signal,cache:'no-store',redirect:'manual'};
    if(!['GET','HEAD'].includes(req.method)&&req.body){
      // Stream folder uploads directly to FastAPI; never materialize gigabytes
      // with formData(), arrayBuffer(), or a Next.js rewrite body buffer.
      options.body=req.body;
      options.duplex='half';
    }
    const upstream=await fetch(target,options);
    const responseHeaders=new Headers();
    upstream.headers.forEach((value,name)=>{
      // fetch decompresses upstream bodies; original encoded size/encoding
      // would corrupt downloads if forwarded alongside the decoded stream.
      if(!HOP_BY_HOP.has(name)&&!['content-length','content-encoding','set-cookie','location'].includes(name))responseHeaders.set(name,value);
    });
    for(const cookie of upstream.headers.getSetCookie())responseHeaders.append('set-cookie',cookie);
    const location=upstream.headers.get('location');
    if(location){
      const redirected=new URL(location,target);
      const prefix=`${base.pathname.replace(/\/+$/,'')}/`;
      if(redirected.origin!==base.origin||!redirected.pathname.startsWith(prefix))throw new Error('Unexpected backend redirect');
      responseHeaders.set('location',`/api/backend/${redirected.pathname.slice(prefix.length)}${redirected.search}${redirected.hash}`);
    }
    responseHeaders.set('cache-control','no-store');
    responseHeaders.set('x-content-type-options','nosniff');
    return new Response(req.method==='HEAD'||[204,205,304].includes(upstream.status)?null:upstream.body,{status:upstream.status,headers:responseHeaders});
  }catch{
    // Keep hostnames, local paths and connection details out of error responses.
    return NextResponse.json({detail:'Unable to reach the inspection backend. Check the server connection.'},{status:502,headers:{'Cache-Control':'no-store'}});
  }
}

export const GET=proxy;
export const POST=proxy;
export const PUT=proxy;
export const PATCH=proxy;
export const DELETE=proxy;
export const HEAD=proxy;
export const OPTIONS=proxy;
