import { Component } from '@angular/core';
import { ScreeningComponent } from './screening/screening.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ScreeningComponent],
  template: `<app-screening></app-screening>`,
})
export class AppComponent {}
