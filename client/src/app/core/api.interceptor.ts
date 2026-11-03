import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ApiError } from './api-error';
import { API_GATEWAY_URL } from './api.config';
import { ApiErrorBody } from './models';
import { AuthService } from './auth.service';

/**
 * For every request to the gateway:
 *  - adds "Authorization: Bearer <token>" when logged in (never to other hosts),
 *  - turns failures into ApiError with the server's { error: { code, message } },
 *  - on 401 for an authenticated call, logs out ("Your session has expired").
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_GATEWAY_URL)) return next(req);

  const auth = inject(AuthService);
  const token = auth.token();
  const request = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) return throwError(() => err);

      if (err.status === 0) {
        return throwError(
          () => new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the API gateway. Is it running on port 5000?'),
        );
      }
      if (err.status === 401 && token) auth.sessionExpired();

      const body = err.error as Partial<ApiErrorBody> | null;
      return throwError(
        () =>
          new ApiError(
            err.status,
            body?.error?.code ?? 'UNKNOWN_ERROR',
            body?.error?.message ?? `Request failed with status ${err.status}.`,
          ),
      );
    }),
  );
};
