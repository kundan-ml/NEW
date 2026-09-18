import './dashboard.css';
import {AppShell} from '@/components/AppShell';
import {InspectionDashboard} from '@/components/InspectionDashboard';

export default function Page(){
  return <AppShell><InspectionDashboard/></AppShell>;
}
