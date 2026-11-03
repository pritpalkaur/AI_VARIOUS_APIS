import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { apiInterceptor } from './core/api.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Route params / query params (":id", "?returnUrl=") arrive as component inputs.
    provideRouter(routes, withComponentInputBinding()),
    // Every API call goes through apiInterceptor (bearer token + error mapping).
    provideHttpClient(withFetch(), withInterceptors([apiInterceptor])),
  ],
};
