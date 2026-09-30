import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { COLORES_OJOS, TIPOS_SANGRE } from '../../../core/models/perfil.model';
import { fechaNacimientoValida } from '../../../core/validators/fecha.validators';

const passwordsIguales: ValidatorFn = (grupo: AbstractControl): ValidationErrors | null => {
  const password = grupo.get('password')?.value;
  const confirmar = grupo.get('confirmarPassword')?.value;
  return password && confirmar && password !== confirmar ? { passwordsDistintas: true } : null;
};

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './registro.component.html',
  styleUrl: '../auth.css'
})
export class RegistroComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly tiposSangre = TIPOS_SANGRE;
  readonly coloresOjos = COLORES_OJOS;
  readonly hoy = new Date().toISOString().slice(0, 10);

  readonly form = inject(FormBuilder).nonNullable.group(
    {
      nombre: ['', [Validators.required, Validators.maxLength(60)]],
      apellido: ['', [Validators.required, Validators.maxLength(60)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmarPassword: ['', Validators.required],
      fecha_nacimiento: ['', [Validators.required, fechaNacimientoValida]],
      tipo_sangre: ['', Validators.required],
      color_ojos: ['', Validators.required],
      dias_vacaciones_anuales: [
        null as number | null,
        [Validators.required, Validators.min(0), Validators.max(365), Validators.pattern(/^\d+$/)]
      ]
    },
    { validators: passwordsIguales }
  );

  readonly cargando = signal(false);
  readonly error = signal('');
  readonly mailEnviado = signal(false);
  readonly verPassword = signal(false);

  mostrarError(campo: string): boolean {
    const c = this.form.get(campo);
    return !!c && c.touched && c.invalid;
  }

  async registrarme() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.cargando.set(true);
    this.error.set('');
    try {
      const { confirmarPassword, ...datos } = this.form.getRawValue();
      const { requiereConfirmacion } = await this.auth.registrar({
        ...datos,
        email: datos.email.trim(),
        nombre: datos.nombre.trim(),
        apellido: datos.apellido.trim(),
        dias_vacaciones_anuales: Number(datos.dias_vacaciones_anuales)
      });

      if (requiereConfirmacion) {
        this.mailEnviado.set(true);
      } else {
        await this.router.navigateByUrl('/');
      }
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }
}
