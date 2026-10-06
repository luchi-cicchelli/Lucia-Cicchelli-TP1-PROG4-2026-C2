import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RecompensasService } from '../../../core/services/recompensas.service';
import { CandyService } from '../../../core/services/candy.service';
import { Recompensa, TipoRecompensa } from '../../../core/models/beneficios.model';
import { ProductoCandy } from '../../../core/models/candy.model';

@Component({
  selector: 'app-recompensas-admin',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './recompensas-admin.component.html',
  styleUrl: '../cupones-admin/cupones-admin.component.css'
})
export class RecompensasAdminComponent implements OnInit {
  private readonly recompensasService = inject(RecompensasService);
  private readonly candy = inject(CandyService);
  private readonly fb = inject(FormBuilder);

  readonly recompensas = signal<Recompensa[]>([]);
  readonly productos = signal<ProductoCandy[]>([]);
  readonly error = signal('');
  readonly formAbierto = signal(false);
  readonly editandoId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(60)]],
    puntos_requeridos: [1000, [Validators.required, Validators.min(1)]],
    tipo: ['entrada_gratis' as TipoRecompensa, Validators.required],
    producto_id: [''],
    activo: [true]
  });

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    try {
      const [recompensas, productos] = await Promise.all([
        this.recompensasService.listar(),
        this.candy.listarProductos()
      ]);
      this.recompensas.set(recompensas);
      this.productos.set(productos);
    } catch (e: any) {
      this.error.set('No se pudieron cargar las recompensas: ' + e.message);
    }
  }

  nombreProducto(id: string | null): string {
    return this.productos().find((p) => p.id === id)?.nombre ?? '';
  }

  nueva() {
    this.editandoId.set(null);
    this.form.reset({ nombre: '', puntos_requeridos: 1000, tipo: 'entrada_gratis', producto_id: '', activo: true });
    this.formAbierto.set(true);
  }

  editar(r: Recompensa) {
    this.editandoId.set(r.id);
    this.form.reset({
      nombre: r.nombre,
      puntos_requeridos: r.puntos_requeridos,
      tipo: r.tipo,
      producto_id: r.producto_id ?? '',
      activo: r.activo
    });
    this.formAbierto.set(true);
  }

  async guardar() {
    const v = this.form.getRawValue();
    if (this.form.invalid || (v.tipo === 'producto_candy' && !v.producto_id)) {
      this.form.markAllAsTouched();
      this.error.set(v.tipo === 'producto_candy' && !v.producto_id ? 'Elegí qué producto se regala.' : '');
      return;
    }
    await this.ejecutar(async () => {
      await this.recompensasService.guardar(
        { ...v, puntos_requeridos: Number(v.puntos_requeridos), producto_id: v.producto_id || null },
        this.editandoId() ?? undefined
      );
      this.formAbierto.set(false);
    });
  }

  async toggle(r: Recompensa) {
    await this.ejecutar(() => this.recompensasService.cambiarActivo(r.id, !r.activo));
  }

  private async ejecutar(accion: () => Promise<void>) {
    this.error.set('');
    try {
      await accion();
      await this.cargar();
    } catch (e: any) {
      this.error.set(e.message);
    }
  }
}
