import {NextResponse} from 'next/server';
import sharp from 'sharp';

export const runtime='nodejs';

const MAX_PREVIEW_FILE_BYTES=100*1024*1024;

export async function POST(request:Request){
  try{
    const form=await request.formData();
    const file=form.get('file');
    if(!(file instanceof File)||!/\.tiff?$/i.test(file.name)){
      return NextResponse.json({detail:'A TIFF image is required.'},{status:400});
    }
    if(file.size>MAX_PREVIEW_FILE_BYTES){
      return NextResponse.json({detail:'TIFF preview exceeds the 100 MB limit.'},{status:413});
    }
    const input=Buffer.from(await file.arrayBuffer());
    const png=await sharp(input,{page:0,limitInputPixels:100_000_000})
      .rotate()
      .resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true})
      .png()
      .toBuffer();
    return new NextResponse(new Uint8Array(png),{
      headers:{'Content-Type':'image/png','Cache-Control':'no-store'},
    });
  }catch(error){
    return NextResponse.json({detail:error instanceof Error?error.message:'Could not decode TIFF image.'},{status:422});
  }
}
