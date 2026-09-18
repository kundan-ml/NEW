'use client';
import {AlertTriangle,RefreshCw} from 'lucide-react';
export default function ErrorPage({error,reset}:{error:Error&{digest?:string};reset:()=>void}){return <div className="fatalState"><div><i><AlertTriangle/></i><span className="eyebrowText">UI RECOVERY</span><h1>This workspace hit an unexpected error</h1><p>{error.message||'The page could not be rendered. Your backend and inspection data were not modified.'}</p><button onClick={reset}><RefreshCw/>Recover workspace</button></div></div>}
