import { Component, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { takeFlash } from '../core/format';
import { Alert } from '../shared/alert';

type LoginErrors = Partial<Record<'username' | 'password', string>>;

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, Alert],
  template: `
    <div class="auth-page">
      <form class="card auth-card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h1>Log in</h1>
        <app-alert type="info" [message]="auth.notice()" [closable]="true" (closed)="auth.notice.set(null)" />
        <app-alert type="success" [message]="flash()" />
        <app-alert type="error" [message]="serverError()" />

        <label>
          Username
          <input formControlName="username" autocomplete="username" autofocus />
          @if (errors().username; as e) { <span class="field-error">{{ e }}</span> }
        </label>

        <label>
          Password
          <input type="password" formControlName="password" autocomplete="current-password" />
          @if (errors().password; as e) { <span class="field-error">{{ e }}</span> }
        </label>

        <button type="submit" class="btn btn-primary" [disabled]="submitting()">
          {{ submitting() ? 'Logging in…' : 'Log in' }}
        </button>
        <p class="muted center">No account? <a routerLink="/register">Register</a></p>
      </form>
    </div>
  `,
})
export class LoginPage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** ?returnUrl= set by the auth guard. */
  readonly returnUrl = input<string>();

  protected readonly form = new FormGroup({
    username: new FormControl('', { nonNullable: true }),
    password: new FormControl('', { nonNullable: true }),
  });
  protected readonly errors = signal<LoginErrors>({});
  protected readonly serverError = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly flash = signal(takeFlash());

  protected submit(): void {
    const { username, password } = this.form.getRawValue();
    const errors: LoginErrors = {};
    if (!username.trim()) errors.username = 'Username is required.';
    if (!password) errors.password = 'Password is required.';
    this.errors.set(errors);
    this.serverError.set(null);
    if (Object.keys(errors).length > 0) return;

    this.submitting.set(true);
    this.auth.login(username.trim(), password).subscribe({
      next: () => void this.router.navigateByUrl(safeReturnUrl(this.returnUrl())),
      error: (err: unknown) => {
        this.serverError.set(errorMessage(err));
        this.submitting.set(false);
      },
    });
  }
}

/** Only same-app paths: blocks open redirects like ?returnUrl=//evil.example. */
function safeReturnUrl(url: string | undefined): string {
  return url && url.startsWith('/') && !url.startsWith('//') ? url : '/products';
}
