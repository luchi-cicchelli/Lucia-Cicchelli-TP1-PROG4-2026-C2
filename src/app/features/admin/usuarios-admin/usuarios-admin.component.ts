import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { UsuarioResumen, UsuariosService } from '../../../core/services/usuarios.service';
import { ROLES, Rol } from '../../../core/models/perfil.model';

@Component({
  selector: 'app-usuarios-admin',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './usuarios-admin.component.html',
  styleUrl: './usuarios-admin.component.css'
})
export class UsuariosAdminComponent implements OnInit {
  private readonly usuariosService = inject(UsuariosService);
  readonly auth = inject(AuthService);

  readonly roles = ROLES;
  readonly usuarios = signal<UsuarioResumen[]>([]);
  readonly busqueda = signal('');
  readonly filtroRol = signal<Rol | ''>('');
  readonly cargando = signal(false);
  readonly guardandoId = signal<string | null>(null);
  readonly error = signal('');

  readonly usuariosFiltrados = computed(() => {
    const texto = this.busqueda().trim().toLowerCase();
    const rol = this.filtroRol();
    return this.usuarios().filter((u) => {
      const coincideTexto =
        !texto ||
        `${u.nombre} ${u.apellido} ${u.email ?? ''}`.toLowerCase().includes(texto);
      return coincideTexto && (!rol || u.rol === rol);
    });
  });

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    this.cargando.set(true);
    this.error.set('');
    try {
      this.usuarios.set(await this.usuariosService.listar());
    } catch (e: any) {
      this.error.set('No se pudieron cargar los usuarios: ' + e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  async cambiarRol(usuario: UsuarioResumen, nuevoRol: Rol) {
    if (nuevoRol === usuario.rol) return;

    this.guardandoId.set(usuario.id);
    this.error.set('');
    try {
      await this.usuariosService.cambiarRol(usuario.id, nuevoRol);
      this.usuarios.update((lista) =>
        lista.map((u) => (u.id === usuario.id ? { ...u, rol: nuevoRol } : u))
      );
    } catch (e: any) {
      this.error.set('No se pudo cambiar el rol: ' + e.message);
      // Recarga para que el select vuelva a mostrar el rol real.
      await this.cargar();
    } finally {
      this.guardandoId.set(null);
    }
  }

  esUnoMismo(u: UsuarioResumen): boolean {
    return u.id === this.auth.perfil()?.id;
  }

  alCambiarRol(u: UsuarioResumen, evento: Event) {
    this.cambiarRol(u, (evento.target as HTMLSelectElement).value as Rol);
  }

  alBuscar(evento: Event) {
    this.busqueda.set((evento.target as HTMLInputElement).value);
  }

  alFiltrarRol(evento: Event) {
    this.filtroRol.set((evento.target as HTMLSelectElement).value as Rol | '');
  }
}
