import '../dashboard.css';
import {AppShell} from '@/components/AppShell';
import {InspectionDashboard} from '@/components/InspectionDashboard';

export default function DashboardPage(){
  return <AppShell><InspectionDashboard/></AppShell>;
}
