import { Routes } from '@angular/router';
import { authGuard, ingresoGuard, sinCuentaGuard, rolGuard } from './core/guards/auth.guards';

export const routes: Routes = [
  // --- Hay que entrar (con cuenta o como invitado) ---
  {
    path: '',
    canActivate: [ingresoGuard],
    loadComponent: () =>
      import('./features/home/home.component').then((m) => m.HomeComponent)
  },
  {
    path: 'pelicula/:id',
    canActivate: [ingresoGuard],
    loadComponent: () =>
      import('./features/pelicula-detalle/pelicula-detalle.component').then(
        (m) => m.PeliculaDetalleComponent
      )
  },
  {
    // Los invitados también pueden comprar.
    path: 'checkout/:funcionId',
    canActivate: [ingresoGuard],
    loadComponent: () =>
      import('./features/checkout/checkout.component').then((m) => m.CheckoutComponent)
  },

  {
    path: 'compra/:id',
    canActivate: [ingresoGuard],
    loadComponent: () =>
      import('./features/compra-exitosa/compra-exitosa.component').then((m) => m.CompraExitosaComponent)
  },

  // --- Login y registro (sin cuenta; un invitado puede entrar para crearse una) ---
  {
    path: 'login',
    canActivate: [sinCuentaGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'registro',
    canActivate: [sinCuentaGuard],
    loadComponent: () =>
      import('./features/auth/registro/registro.component').then((m) => m.RegistroComponent)
  },

  // --- Cliente logueado ---
  {
    path: 'perfil',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/perfil/perfil.component').then((m) => m.PerfilComponent)
  },

  // --- Admin ---
  {
    path: 'admin',
    canActivate: [rolGuard(['admin'])],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/admin/admin-dashboard/admin-dashboard.component').then(
            (m) => m.AdminDashboardComponent
          )
      },
      {
        path: 'peliculas',
        loadComponent: () =>
          import('./features/admin/peliculas-admin/peliculas-admin.component').then(
            (m) => m.PeliculasAdminComponent
          )
      },
      {
        path: 'salas',
        loadComponent: () =>
          import('./features/admin/salas-admin/salas-admin.component').then(
            (m) => m.SalasAdminComponent
          )
      },
      {
        path: 'funciones',
        loadComponent: () =>
          import('./features/admin/funciones-admin/funciones-admin.component').then(
            (m) => m.FuncionesAdminComponent
          )
      },
      {
        path: 'candy',
        loadComponent: () =>
          import('./features/admin/candy-admin/candy-admin.component').then(
            (m) => m.CandyAdminComponent
          )
      },
      {
        path: 'cupones',
        loadComponent: () =>
          import('./features/admin/cupones-admin/cupones-admin.component').then(
            (m) => m.CuponesAdminComponent
          )
      },
      {
        path: 'recompensas',
        loadComponent: () =>
          import('./features/admin/recompensas-admin/recompensas-admin.component').then(
            (m) => m.RecompensasAdminComponent
          )
      },
      {
        path: 'reportes',
        loadComponent: () =>
          import('./features/admin/reportes/reportes.component').then((m) => m.ReportesComponent)
      },
      {
        path: 'actividad',
        loadComponent: () =>
          import('./features/admin/actividad/actividad.component').then((m) => m.ActividadComponent)
      },
      {
        path: 'usuarios',
        loadComponent: () =>
          import('./features/admin/usuarios-admin/usuarios-admin.component').then(
            (m) => m.UsuariosAdminComponent
          )
      }
    ]
  },

  // --- Empleado (el admin también puede entrar) ---
  {
    path: 'empleado/escaner',
    canActivate: [rolGuard(['empleado', 'admin'])],
    loadComponent: () =>
      import('./features/empleado/escaner/escaner.component').then(
        (m) => m.EscanerComponent
      )
  },

  { path: '**', redirectTo: '' }
];
