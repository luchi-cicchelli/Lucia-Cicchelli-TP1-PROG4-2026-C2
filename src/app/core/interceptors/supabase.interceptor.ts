import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';
import { CargandoService } from '../services/cargando.service';

// Las Edge Functions de Supabase piden la apikey y el token del usuario.
// En vez de agregarlos en cada llamada, el interceptor los suma a toda petición a Supabase
// y de paso prende/apaga la barra de carga.
export const supabaseInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.supabaseUrl)) {
    return next(req);
  }

  const token = inject(AuthService).session()?.access_token;
  const cargando = inject(CargandoService);

  const reqConHeaders = req.clone({
    setHeaders: {
      apikey: environment.supabaseAnonKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  cargando.empezar();
  return next(reqConHeaders).pipe(finalize(() => cargando.terminar()));
};
