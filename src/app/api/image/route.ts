import {NextRequest,NextResponse} from 'next/server';

export const dynamic='force-dynamic';

export async function GET(req:NextRequest){
  const datasetId=req.nextUrl.searchParams.get('datasetId');
  const sampleId=req.nextUrl.searchParams.get('sampleId');
  const channel=req.nextUrl.searchParams.get('channel');
  if(!datasetId||!sampleId||!channel)return NextResponse.json({detail:'datasetId, sampleId and channel are required'},{status:400});
  const base=(process.env.BACKEND_API_URL||process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000/api/v1').replace(/\/$/,'');
  const url=`${base}/datasets/${encodeURIComponent(datasetId)}/preview/${encodeURIComponent(sampleId)}/${encodeURIComponent(channel)}.png`;
  try{
    const upstream=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!upstream.ok)return NextResponse.json({detail:`Image backend returned ${upstream.status}`},{status:upstream.status});
    const body=await upstream.arrayBuffer();
    return new NextResponse(body,{status:200,headers:{'Content-Type':upstream.headers.get('content-type')||'image/png','Cache-Control':'no-store, max-age=0','X-Image-Proxy':'lens-inspection-v4'}});
  }catch(error){
    return NextResponse.json({detail:error instanceof Error?error.message:'Unable to load image'},{status:502});
  }
}
