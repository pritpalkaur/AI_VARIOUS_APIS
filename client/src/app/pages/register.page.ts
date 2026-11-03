import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError, errorMessage } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { Alert } from '../shared/alert';

type RegisterErrors = Partial<Record<'username' | 'email' | 'password' | 'confirm', string>>;

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, Alert],
  template: `
    <div class="auth-page">
      <form class="card auth-card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h1>Create account</h1>
        <app-alert type="error" [message]="serverError()" />

        <label>
          Username
          <input formControlName="username" autocomplete="username" autofocus />
          @if (errors().username; as e) { <span class="field-error">{{ e }}</span> }
        </label>
        <label>
          Email
          <input type="email" formControlName="email" autocomplete="email" />
          @if (errors().email; as e) { <span class="field-error">{{ e }}</span> }
        </label>
        <label>
          Password
          <input type="password" formControlName="password" autocomplete="new-password" />
          @if (errors().password; as e) { <span class="field-error">{{ e }}</span> }
        </label>
        <label>
          Confirm password
          <input type="password" formControlName="confirm" autocomplete="new-password" />
          @if (errors().confirm; as e) { <span class="field-error">{{ e }}</span> }
        </label>

        <button type="submit" class="btn btn-primary" [disabled]="submitting()">
          {{ submitting() ? 'Creating…' : 'Create account' }}
        </button>
        <p class="muted center">Already registered? <a routerLink="/login">Log in</a></p>
      </form>
    </div>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = new FormGroup({
    username: new FormControl('', { nonNullable: true }),
    email: new FormControl('', { nonNullable: true }),
    password: new FormControl('', { nonNullable: true }),
    confirm: new FormControl('', { nonNullable: true }),
  });
  protected readonly errors = signal<RegisterErrors>({});
  protected readonly serverError = signal<string | null>(null);
  protected readonly submitting = signal(false);

  protected submit(): void {
    const value = this.form.getRawValue();
    const errors = validate(value);
    this.errors.set(errors);
    this.serverError.set(null);
    if (Object.keys(errors).length > 0) return;

    this.submitting.set(true);
    this.auth
      .register({ username: value.username.trim(), email: value.email.trim(), password: value.password })
      .subscribe({
        next: () => void this.router.navigate(['/login'], { state: { flash: 'Account created. You can log in now.' } }),
        error: (err: unknown) => {
          if (err instanceof ApiError && err.code === 'USERNAME_TAKEN') this.errors.set({ username: err.message });
          else if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') this.errors.set({ email: err.message });
          else this.serverError.set(errorMessage(err));
          this.submitting.set(false);
        },
      });
  }
}

/** Mirrors the Auth Service rules so most mistakes are caught before the request. */
function validate(v: { username: string; email: string; password: string; confirm: string }): RegisterErrors {
  const errors: RegisterErrors = {};
  const name = v.username.trim();
  if (!name) errors.username = 'Username is required.';
  else if (name.length < 3 || name.length > 50) errors.username = 'Username must be 3–50 characters.';
  else if (!/^[A-Za-z0-9_.-]+$/.test(name)) errors.username = "Only letters, digits, '_', '.' and '-' are allowed.";

  const mail = v.email.trim();
  if (!mail) errors.email = 'Email is required.';
  else if (mail.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) errors.email = 'Enter a valid email address.';

  if (!v.password) errors.password = 'Password is required.';
  else if (v.password.length < 8) errors.password = 'Password must be at least 8 characters.';
  else if (new TextEncoder().encode(v.password).length > 72) errors.password = 'Password must be at most 72 bytes.';
  else if (!/[A-Za-z]/.test(v.password) || !/\d/.test(v.password)) {
    errors.password = 'Password needs at least one letter and one digit.';
  }

  if (v.confirm !== v.password) errors.confirm = 'Passwords do not match.';
  return errors;
}
