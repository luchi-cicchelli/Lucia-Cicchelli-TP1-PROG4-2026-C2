import { Routes } from '@angular/router';

export const routes: Routes = [
  // --- Público ---
  {
    path: '',
    loadComponent: () =>
      import('./features/home/home.component').then((m) => m.HomeComponent)
  },
  {
    path: 'pelicula/:id',
    loadComponent: () =>
      import('./features/pelicula-detalle/pelicula-detalle.component').then(
        (m) => m.PeliculaDetalleComponent
      )
  },
  {
    path: 'checkout/:funcionId',
    loadComponent: () =>
      import('./features/checkout/checkout.component').then((m) => m.CheckoutComponent)
  },

  // --- Cliente logueado ---
  // TODO: agregar canActivate: [authGuard] cuando armemos auth (paso 3)
  {
    path: 'perfil',
    loadComponent: () =>
      import('./features/perfil/perfil.component').then((m) => m.PerfilComponent)
  },

  // --- Admin ---
  // TODO: agregar canActivate: [authGuard, roleGuard(['admin'])]
  {
    path: 'admin',
    loadComponent: () =>
      import('./features/admin/admin-dashboard/admin-dashboard.component').then(
        (m) => m.AdminDashboardComponent
      )
  },
  {
    path: 'admin/peliculas',
    loadComponent: () =>
      import('./features/admin/peliculas-admin/peliculas-admin.component').then(
        (m) => m.PeliculasAdminComponent
      )
  },

  // --- Empleado ---
  // TODO: agregar canActivate: [authGuard, roleGuard(['empleado', 'admin'])]
  {
    path: 'empleado/escaner',
    loadComponent: () =>
      import('./features/empleado/escaner/escaner.component').then(
        (m) => m.EscanerComponent
      )
  },

  { path: '**', redirectTo: '' }
];
