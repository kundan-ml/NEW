'use client';
import {UIProvider} from './UIProvider';
import type {UiPreferences} from './UIProvider';

export function ClientProviders({children,initialPreferences}:{children:React.ReactNode;initialPreferences?:Partial<UiPreferences>}){
  return <UIProvider initialPreferences={initialPreferences}>{children}</UIProvider>;
}
