import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { applyAppTheme, loadAppTheme } from './core/state/sidebar-theme';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {
  constructor() {
    applyAppTheme(loadAppTheme());
  }
}
