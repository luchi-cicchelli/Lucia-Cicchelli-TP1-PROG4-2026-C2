import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Rol } from '../models/perfil.model';

// Para usar la app hay que haber entrado: con cuenta o como invitado.
export const ingresoGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.listo;

  return auth.tieneSesion()
    ? true
    : router.createUrlTree(['/login'], { queryParams: { volver: state.url } });
};

// Solo usuarios con cuenta (no invitados).
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

// Login y registro: si ya entró con cuenta lo manda a su inicio (un invitado sí puede pasar).
export const sinCuentaGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.listo;

  return auth.estaLogueado() ? router.createUrlTree([auth.rutaInicio()]) : true;
};
