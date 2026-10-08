import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Rol } from '../models/perfil.model';

export const ingresoGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.listo;

  return auth.tieneSesion()
    ? true
    : router.createUrlTree(['/login'], { queryParams: { volver: state.url } });
};

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.listo;

  return auth.estaLogueado()
    ? true
    : router.createUrlTree(['/login'], { queryParams: { volver: state.url } });
};

export function rolGuard(roles: Rol[]): CanActivateFn {
  return async (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.listo;

    if (!auth.estaLogueado()) {
      return router.createUrlTree(['/login'], { queryParams: { volver: state.url } });
    }
    const rol = auth.rol();
    return rol !== null && roles.includes(rol) ? true : router.createUrlTree(['/']);
  };
}

export const sinCuentaGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.listo;

  return auth.estaLogueado() ? router.createUrlTree([auth.rutaInicio()]) : true;
};
