'use client';
import {CustomizationDrawer} from '@/components/CustomizationDrawer';
export default function UIStudioPage(){return <main className="studioWindowPage"><CustomizationDrawer open popout onClose={()=>window.close()}/></main>}
