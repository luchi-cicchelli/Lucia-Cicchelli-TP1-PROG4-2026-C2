import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Acceso {
  ruta: string;
  titulo: string;
  descripcion: string;
}

@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css'
})
export class AdminDashboardComponent {
  readonly grupos: { titulo: string; accesos: Acceso[] }[] = [
    {
      titulo: 'Cartelera',
      accesos: [
        { ruta: '/admin/peliculas', titulo: 'Películas', descripcion: 'Catálogo, pósters, preventa y alertas' },
        { ruta: '/admin/funciones', titulo: 'Funciones', descripcion: 'Horarios con sala automática y precios' },
        { ruta: '/admin/salas', titulo: 'Salas', descripcion: 'Salas y mapa de butacas' }
      ]
    },
    {
      titulo: 'Ventas y beneficios',
      accesos: [
        { ruta: '/admin/candy', titulo: 'Candy bar', descripcion: 'Productos, categorías y combos' },
        { ruta: '/admin/cupones', titulo: 'Cupones', descripcion: 'Bienvenida y descuentos especiales' },
        { ruta: '/admin/recompensas', titulo: 'Recompensas', descripcion: 'Canjes del programa de puntos' }
      ]
    },
    {
      titulo: 'Control',
      accesos: [
        { ruta: '/admin/reportes', titulo: 'Reportes', descripcion: 'Facturación, gráficos y exportación' },
        { ruta: '/admin/actividad', titulo: 'Actividad', descripcion: 'Log de quién hizo qué y cuándo' },
        { ruta: '/admin/usuarios', titulo: 'Usuarios y roles', descripcion: 'Empleados y administradores' },
        { ruta: '/empleado/escaner', titulo: 'Escáner', descripcion: 'Validar entradas y retiros de candy' }
      ]
    }
  ];
}
