import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive],
  template: `
    @if (auth.user(); as user) {
      <header class="navbar">
        <nav class="navbar-inner">
          <span class="brand">Store Admin</span>
          <a routerLink="/products" routerLinkActive="active">Products</a>
          <a routerLink="/orders" routerLinkActive="active">Orders</a>
          <span class="spacer"></span>
          <span class="user">
            {{ user.username }}
            <span class="badge badge-{{ user.role.toLowerCase() }}">{{ user.role }}</span>
          </span>
          <button type="button" class="btn btn-ghost" (click)="auth.logout()">Log out</button>
        </nav>
      </header>
    }
  `,
})
export class Navbar {
  protected readonly auth = inject(AuthService);
}
