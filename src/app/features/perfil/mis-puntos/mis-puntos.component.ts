import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { RecompensasService } from '../../../core/services/recompensas.service';
import { MovimientoPuntos, Recompensa } from '../../../core/models/beneficios.model';

const ETIQUETAS: Record<MovimientoPuntos['tipo'], string> = {
  ganado: 'Ganaste por una compra',
  canjeado: 'Canjeaste',
  devuelto: 'Te devolvimos (compra cancelada)',
  descontado: 'Se descontaron (compra cancelada)'
};

@Component({
  selector: 'app-mis-puntos',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './mis-puntos.component.html',
  styleUrl: './mis-puntos.component.css'
})
export class MisPuntosComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly recompensasService = inject(RecompensasService);

  readonly movimientos = signal<MovimientoPuntos[]>([]);
  readonly recompensas = signal<Recompensa[]>([]);
  readonly cargando = signal(true);
  readonly error = signal('');

  async ngOnInit() {
    const id = this.auth.perfil()?.id;
    if (!id) return;
    try {
      const [movimientos, recompensas] = await Promise.all([
        this.recompensasService.historial(id),
        this.recompensasService.listar(true)
      ]);
      this.movimientos.set(movimientos);
      this.recompensas.set(recompensas);
    } catch (e: any) {
      this.error.set('No se pudo cargar tu historial de puntos: ' + e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  etiqueta(m: MovimientoPuntos): string {
    const base = ETIQUETAS[m.tipo];
    return m.recompensa ? `${base}: ${m.recompensa.nombre}` : base;
  }

  suma(m: MovimientoPuntos): boolean {
    return m.tipo === 'ganado' || m.tipo === 'devuelto';
  }
}
