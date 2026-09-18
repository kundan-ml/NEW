import './globals.css';
import {ClientProviders} from '@/components/ClientProviders';

export const metadata={
  title:'Lens Inspection Control Center',
  description:'Premium compact production workstation for optical contact lens inspection'
};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en">
    <body>
      <ClientProviders>{children}</ClientProviders>
    </body>
  </html>;
}
