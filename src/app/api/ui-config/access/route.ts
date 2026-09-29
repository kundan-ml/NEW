import {NextResponse} from 'next/server';

export const dynamic='force-dynamic';

export async function GET(){
  try{
    const backend=process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000/api/v1';
    const response=await fetch(`${backend}/auth/current`,{cache:'no-store'});
    if(!response.ok)return NextResponse.json({canCustomize:false,error:'Unable to verify administrator access.'},{status:503});
    const session=await response.json();
    return NextResponse.json({canCustomize:session.role==='Administrator',role:session.role||null});
  }catch{
    return NextResponse.json({canCustomize:false,error:'Unable to reach the authentication service.'},{status:503});
  }
}
