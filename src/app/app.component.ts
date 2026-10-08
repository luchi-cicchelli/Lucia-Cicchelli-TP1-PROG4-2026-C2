import { Component, effect, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { CargandoService } from './core/services/cargando.service';
import { AuthService } from './core/services/auth.service';
import { AlertasService, AvisoEstreno } from './core/services/alertas.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, NavbarComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  readonly cargando = inject(CargandoService).cargando;
  private readonly auth = inject(AuthService);
  readonly alertas = inject(AlertasService);

  constructor() {
    // Cuando entra un usuario con cuenta, se fija si abrió la venta de alguna película con alerta.
    effect(() => {
      const id = this.auth.perfil()?.id;
      if (id) {
        this.alertas.buscarAvisos(id).catch((e) => console.error('No se pudieron traer los avisos', e));
      } else {
        this.alertas.limpiarAvisos();
      }
    });
  }

  cerrar(aviso: AvisoEstreno) {
    this.alertas.marcarVisto(aviso);
  }
}
