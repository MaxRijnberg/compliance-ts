import { Routes } from '@angular/router';
import { ScreeningComponent } from './screening/screening.component';
import { ClientCreatorComponent } from './client-creator/client-creator.component';

export const routes: Routes = [
  { path: '', redirectTo: 'screening', pathMatch: 'full' },
  { path: 'screening', component: ScreeningComponent },
  { path: 'client-creator', component: ClientCreatorComponent },
];
