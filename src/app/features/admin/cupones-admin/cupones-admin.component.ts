import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CuponesService } from '../../../core/services/cupones.service';
import { Cupon, TipoCupon } from '../../../core/models/beneficios.model';

function aFechaInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function desdeInput(valor: string, finDelDia = false): string {
  const [a, m, d] = valor.split('-').map(Number);
  return (finDelDia ? new Date(a, m - 1, d, 23, 59, 59) : new Date(a, m - 1, d)).toISOString();
}

/** La fecha "hasta" no puede ser anterior a "desde". */
const vigenciaValida: ValidatorFn = (grupo: AbstractControl): ValidationErrors | null => {
  const desde = grupo.get('desde')?.value;
  const hasta = grupo.get('hasta')?.value;
  return desde && hasta && hasta < desde ? { vigenciaInvertida: true } : null;
};

@Component({
  selector: 'app-cupones-admin',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DatePipe],
  templateUrl: './cupones-admin.component.html',
  styleUrl: './cupones-admin.component.css'
})
export class CuponesAdminComponent implements OnInit {
  private readonly cuponesService = inject(CuponesService);
  private readonly fb = inject(FormBuilder);

  readonly cupones = signal<Cupon[]>([]);
  readonly cargando = signal(false);
  readonly error = signal('');
  readonly mensaje = signal('');
  readonly formAbierto = signal(false);
  readonly editandoId = signal<string | null>(null);

  readonly bienvenida = computed(() => this.cupones().find((c) => c.codigo === 'BIENVENIDA') ?? null);
  readonly otros = computed(() => this.cupones().filter((c) => c.codigo !== 'BIENVENIDA'));

  readonly porcentajeBienvenida = this.fb.nonNullable.control(20, [
    Validators.required,
    Validators.min(1),
    Validators.max(100)
  ]);

  readonly form = this.fb.nonNullable.group(
    {
      codigo: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9]{3,20}$/)]],
      tipo: ['general' as TipoCupon, Validators.required],
      porcentaje_descuento: [10, [Validators.required, Validators.min(1), Validators.max(100)]],
      edad_minima: [50, [Validators.min(18), Validators.max(120)]],
      desde: [aFechaInput(new Date().toISOString()), Validators.required],
      hasta: [''],
      activo: [true]
    },
    { validators: vigenciaValida }
  );

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    this.cargando.set(true);
    try {
      this.cupones.set(await this.cuponesService.listar());
      this.porcentajeBienvenida.setValue(this.bienvenida()?.porcentaje_descuento ?? 20);
    } catch (e: any) {
      this.error.set('No se pudieron cargar los cupones: ' + e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  async guardarBienvenida() {
    const b = this.bienvenida();
    if (!b || this.porcentajeBienvenida.invalid) return;
    await this.ejecutar(
      () =>
        this.cuponesService.guardar(
          { ...b, porcentaje_descuento: Number(this.porcentajeBienvenida.value) },
          b.id
        ),
      'Porcentaje de bienvenida actualizado.'
    );
  }

  nuevo() {
    this.editandoId.set(null);
    this.form.reset({
      codigo: '',
      tipo: 'general',
      porcentaje_descuento: 10,
      edad_minima: 50,
      desde: aFechaInput(new Date().toISOString()),
      hasta: '',
      activo: true
    });
    this.formAbierto.set(true);
  }

  editar(c: Cupon) {
    this.editandoId.set(c.id);
    this.form.reset({
      codigo: c.codigo,
      tipo: c.tipo,
      porcentaje_descuento: c.porcentaje_descuento,
      edad_minima: c.edad_minima ?? 50,
      desde: aFechaInput(c.fecha_inicio),
      hasta: aFechaInput(c.fecha_fin),
      activo: c.activo
    });
    this.formAbierto.set(true);
  }

  async guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    await this.ejecutar(async () => {
      await this.cuponesService.guardar(
        {
          codigo: v.codigo,
          tipo: v.tipo,
          porcentaje_descuento: Number(v.porcentaje_descuento),
          edad_minima: v.tipo === 'mayores_50' ? Number(v.edad_minima) : null,
          fecha_inicio: desdeInput(v.desde),
          fecha_fin: v.hasta ? desdeInput(v.hasta, true) : null,
          activo: v.activo
        },
        this.editandoId() ?? undefined
      );
      this.formAbierto.set(false);
    }, 'Cupón guardado.');
  }

  async toggle(c: Cupon) {
    await this.ejecutar(() => this.cuponesService.cambiarActivo(c.id, !c.activo));
  }

  vigente(c: Cupon): boolean {
    const ahora = new Date();
    return c.activo && new Date(c.fecha_inicio) <= ahora && (!c.fecha_fin || new Date(c.fecha_fin) >= ahora);
  }

  private async ejecutar(accion: () => Promise<void>, ok = '') {
    this.error.set('');
    this.mensaje.set('');
    try {
      await accion();
      this.mensaje.set(ok);
      await this.cargar();
    } catch (e: any) {
      this.error.set(e.message);
    }
  }
}
