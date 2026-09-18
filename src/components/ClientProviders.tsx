'use client';
import {UIProvider} from './UIProvider';

export function ClientProviders({children}:{children:React.ReactNode}){
  return <UIProvider>{children}</UIProvider>;
}
