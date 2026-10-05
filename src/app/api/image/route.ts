import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import sharp from 'sharp';

export const dynamic='force-dynamic';
export const runtime='nodejs';

const CACHE_TTL_MS=5*60*1000;
const THUMBNAIL_SIZE=384;
const CACHE_CONTROL='private, max-age=300, must-revalidate';

type CachedImage={body:Uint8Array<ArrayBuffer>;contentType:string;etag:string;expiresAt:number};
type ImageResult={image:CachedImage}|{status:number};

// Separate byte-bounded LRU caches prevent a handful of full-size canvases from
// displacing all WT thumbnails. The backend remains authoritative after the TTL.
class ImageCache{
  private entries=new Map<string,CachedImage>();
  private bytes=0;
  constructor(private readonly maxBytes:number,private readonly maxEntries:number){}

  get(key:string):CachedImage|undefined{
    const entry=this.entries.get(key);
    if(!entry)return;
    if(entry.expiresAt<=Date.now()){
      this.remove(key,entry);
      return;
    }
    this.entries.delete(key);
    this.entries.set(key,entry);
    return entry;
  }

  set(key:string,entry:CachedImage){
    // Large full-size frames can still be served without retaining them in RAM.
    if(entry.body.byteLength>this.maxBytes/4)return;
    const existing=this.entries.get(key);
    if(existing)this.remove(key,existing);
    for(const [cachedKey,cached] of this.entries){
      if(cached.expiresAt<=Date.now())this.remove(cachedKey,cached);
    }
    while(this.bytes+entry.body.byteLength>this.maxBytes||this.entries.size>=this.maxEntries){
      const oldest=this.entries.entries().next().value;
      if(!oldest)break;
      this.remove(oldest[0],oldest[1]);
    }
    this.entries.set(key,entry);
    this.bytes+=entry.body.byteLength;
  }

  private remove(key:string,entry:CachedImage){
    this.entries.delete(key);
    this.bytes-=entry.body.byteLength;
  }
}

const thumbnails=new ImageCache(32*1024*1024,2048);
const fullImages=new ImageCache(64*1024*1024,256);
const pending=new Map<string,Promise<ImageResult>>();

function validSegment(value:string|null,maxLength:number):value is string{
  return !!value&&value.length<=maxLength&&!!value.trim()&&value!=='.'&&value!=='..'&&!/[\\/\x00-\x1f\x7f]/.test(value);
}

function matchesEtag(header:string|null,etag:string):boolean{
  return !!header&&header.split(',').some(value=>{
    const tag=value.trim();
    return tag==='*'||tag.replace(/^W\//,'')===etag;
  });
}

async function loadImage(url:string,thumbnail:boolean,cache:ImageCache):Promise<ImageResult>{
  const upstream=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!upstream.ok)return {status:upstream.status};
  let body=new Uint8Array(await upstream.arrayBuffer());
  let contentType=upstream.headers.get('content-type')||'image/png';
  if(thumbnail){
    // Older backends ignore the size/format query. Always guarantee compact WT
    // previews, but avoid re-encoding thumbnails already optimized upstream.
    const input=Buffer.from(body.buffer,body.byteOffset,body.byteLength);
    const metadata=await sharp(input,{page:0,limitInputPixels:100_000_000}).metadata();
    if(metadata.format!=='webp'||!metadata.width||!metadata.height||metadata.width>THUMBNAIL_SIZE||metadata.height>THUMBNAIL_SIZE){
      body=new Uint8Array(await sharp(input,{page:0,limitInputPixels:100_000_000})
        .rotate()
        .resize({width:THUMBNAIL_SIZE,height:THUMBNAIL_SIZE,fit:'inside',withoutEnlargement:true})
        .webp({quality:80,effort:2})
        .toBuffer());
    }
    contentType='image/webp';
  }
  const image:CachedImage={
    body,contentType,
    etag:`"${createHash('sha256').update(body).digest('base64url')}"`,
    expiresAt:Date.now()+CACHE_TTL_MS,
  };
  cache.set(url,image);
  return {image};
}

export async function GET(req:NextRequest){
  const params=req.nextUrl.searchParams;
  const datasetId=params.get('datasetId');
  const sampleId=params.get('sampleId');
  const channel=params.get('channel');
  const thumbnailParam=params.get('thumbnail');
  if(!datasetId||!sampleId||!channel)return NextResponse.json({detail:'datasetId, sampleId and channel are required'},{status:400});
  if(!validSegment(datasetId,256)||!validSegment(sampleId,256)||!validSegment(channel,64)
    ||(thumbnailParam!==null&&thumbnailParam!=='0'&&thumbnailParam!=='1')
    ||['datasetId','sampleId','channel','thumbnail'].some(key=>params.getAll(key).length>1)){
    return NextResponse.json({detail:'Invalid image preview parameters'},{status:400});
  }
  const thumbnail=thumbnailParam==='1';
  const base=(process.env.BACKEND_API_URL||process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000/api/v1').replace(/\/+$/,'');
  const url=`${base}/datasets/${encodeURIComponent(datasetId)}/preview/${encodeURIComponent(sampleId)}/${encodeURIComponent(channel)}.png${thumbnail?'?width=384&format=webp':''}`;
  const cache=thumbnail?thumbnails:fullImages;
  try{
    let image=cache.get(url);
    if(!image){
      // Both dashboard layouts and preloaders may request the same frame at once.
      // Share its upstream download/encode instead of starting duplicate work.
      let request=pending.get(url);
      if(!request){
        request=loadImage(url,thumbnail,cache);
        pending.set(url,request);
      }
      let result:ImageResult;
      try{result=await request;}finally{if(pending.get(url)===request)pending.delete(url);}
      if('status' in result)return NextResponse.json({detail:`Image backend returned ${result.status}`},{status:result.status,headers:{'Cache-Control':'no-store'}});
      image=result.image;
    }
    const headers={
      'Content-Type':image.contentType,
      'Cache-Control':CACHE_CONTROL,
      ETag:image.etag,
      'X-Content-Type-Options':'nosniff',
      'X-Image-Proxy':'lens-inspection-v5',
    };
    if(matchesEtag(req.headers.get('if-none-match'),image.etag))return new NextResponse(null,{status:304,headers});
    return new NextResponse(image.body,{status:200,headers});
  }catch{
    // Never expose backend URLs, filesystem paths, or decoder internals to clients.
    return NextResponse.json({detail:'Unable to load image preview from backend'},{status:502,headers:{'Cache-Control':'no-store'}});
  }
}
