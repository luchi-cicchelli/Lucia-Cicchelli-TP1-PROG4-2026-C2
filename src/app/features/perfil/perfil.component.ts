import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { COLORES_OJOS, ROLES, TIPOS_SANGRE } from '../../core/models/perfil.model';
import { fechaNacimientoValida } from '../../core/validators/fecha.validators';
import { soloLetras } from '../../core/validators/nombre.validators';
import { SelectorFechaComponent } from '../../shared/components/selector-fecha/selector-fecha.component';
import { MisComprasComponent } from './mis-compras/mis-compras.component';
import { MisPeliculasComponent } from './mis-peliculas/mis-peliculas.component';
import { MisPuntosComponent } from './mis-puntos/mis-puntos.component';

type Pestania = 'datos' | 'entradas' | 'peliculas' | 'puntos';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, CurrencyPipe, MisComprasComponent, MisPeliculasComponent, MisPuntosComponent, SelectorFechaComponent],
  templateUrl: './perfil.component.html',
  styleUrl: './perfil.component.css'
})
export class PerfilComponent {
  readonly auth = inject(AuthService);

  readonly tiposSangre = TIPOS_SANGRE;
  readonly coloresOjos = COLORES_OJOS;
  readonly anioActual = new Date().getFullYear();

  readonly pestanias: { valor: Pestania; etiqueta: string }[] = [
    { valor: 'datos', etiqueta: 'Mis datos' },
    { valor: 'entradas', etiqueta: 'Mis entradas' },
    { valor: 'peliculas', etiqueta: 'Mis películas' },
    { valor: 'puntos', etiqueta: 'Mis puntos' }
  ];
  readonly pestania = signal<Pestania>('datos');

  readonly editando = signal(false);
  readonly guardando = signal(false);
  readonly error = signal('');
  readonly mensaje = signal('');

  readonly form = inject(FormBuilder).nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(60), soloLetras]],
    apellido: ['', [Validators.required, Validators.maxLength(60), soloLetras]],
    fecha_nacimiento: ['', [Validators.required, fechaNacimientoValida]],
    tipo_sangre: ['', Validators.required],
    color_ojos: ['', Validators.required],
    dias_vacaciones_anuales: [
      null as number | null,
      [Validators.required, Validators.min(0), Validators.max(365), Validators.pattern(/^\d+$/)]
    ]
  });

  etiquetaRol(): string {
    return ROLES.find((r) => r.valor === this.auth.rol())?.etiqueta ?? '';
  }

  empezarEdicion() {
    const p = this.auth.perfil();
    if (!p) return;
    this.form.reset({
      nombre: p.nombre,
      apellido: p.apellido,
      fecha_nacimiento: p.fecha_nacimiento,
      tipo_sangre: p.tipo_sangre ?? '',
      color_ojos: p.color_ojos ?? '',
      dias_vacaciones_anuales: p.dias_vacaciones_anuales
    });
    this.mensaje.set('');
    this.error.set('');
    this.editando.set(true);
  }

  async guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.error.set('');
    try {
      const v = this.form.getRawValue();
      await this.auth.actualizarDatos({
        ...v,
        nombre: v.nombre.trim(),
        apellido: v.apellido.trim(),
        dias_vacaciones_anuales: Number(v.dias_vacaciones_anuales)
      });
      this.editando.set(false);
      this.mensaje.set('Tus datos se guardaron.');
    } catch (e: any) {
      this.error.set('No se pudieron guardar los cambios: ' + e.message);
    } finally {
      this.guardando.set(false);
    }
  }
}
