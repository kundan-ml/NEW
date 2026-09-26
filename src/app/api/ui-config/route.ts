import {randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {NextResponse} from 'next/server';
import {getDefaultUiPreferences} from '@/lib/default-ui-config';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const configPath=()=>path.join(process.cwd(),'config','ui-preferences.json');

export async function GET(){
  try{
    const preferences=JSON.parse(await readFile(configPath(),'utf8'));
    return NextResponse.json(preferences);
  }catch(error){
    if((error as NodeJS.ErrnoException).code==='ENOENT')return NextResponse.json(getDefaultUiPreferences());
    return NextResponse.json({error:'Unable to read UI configuration.'},{status:500});
  }
}

export async function PUT(request:Request){
  try{
    const backend=process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000/api/v1';
    const sessionResponse=await fetch(`${backend}/auth/current`,{cache:'no-store'});
    const session=sessionResponse.ok?await sessionResponse.json():null;
    if(session?.role!=='Administrator')return NextResponse.json({error:'Administrator permission required.'},{status:403});
    const preferences=await request.json();
    if(!preferences||typeof preferences!=='object'||Array.isArray(preferences)){
      return NextResponse.json({error:'UI configuration must be an object.'},{status:400});
    }
    const target=configPath();
    const temporary=`${target}.${process.pid}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(target),{recursive:true});
    await writeFile(temporary,`${JSON.stringify(preferences,null,2)}\n`,'utf8');
    await rename(temporary,target);
    return NextResponse.json({ok:true,preferences});
  }catch{
    return NextResponse.json({error:'Unable to save UI configuration.'},{status:500});
  }
}
