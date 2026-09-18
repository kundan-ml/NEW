import '../dashboard.css';
import {AppShell} from '@/components/AppShell';
import {InspectionDashboard} from '@/components/InspectionDashboard';

export default function InspectPage(){
  return <AppShell><InspectionDashboard inspectionMode/></AppShell>;
}
