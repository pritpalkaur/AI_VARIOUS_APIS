import { Component, input, output } from '@angular/core';

/** Coloured message box. Renders nothing when `message` is empty. */
@Component({
  selector: 'app-alert',
  template: `
    @if (message()) {
      <div class="alert alert-{{ type() }}" [attr.role]="type() === 'error' ? 'alert' : 'status'">
        <span>{{ message() }}</span>
        @if (closable()) {
          <button type="button" class="alert-close" (click)="closed.emit()" aria-label="Dismiss">×</button>
        }
      </div>
    }
  `,
})
export class Alert {
  readonly type = input<'error' | 'success' | 'info'>('info');
  readonly message = input<string | null>(null);
  readonly closable = input(false);
  readonly closed = output<void>();
}
