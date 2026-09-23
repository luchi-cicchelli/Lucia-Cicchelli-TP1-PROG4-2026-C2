import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Rol } from '../models/perfil.model';

/** Solo usuarios logueados. Si no, va a /login y después vuelve a donde quería ir. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.listo;

  return auth.estaLogueado()
    ? true
    : router.createUrlTree(['/login'], { queryParams: { volver: state.url } });
};

/** Solo usuarios logueados con alguno de los roles indicados. */
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

/** Para /login y /registro: si ya está logueado, no tiene sentido mostrarlas. */
export const invitadoGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.listo;

  return auth.estaLogueado() ? router.createUrlTree([auth.rutaInicio()]) : true;
};
