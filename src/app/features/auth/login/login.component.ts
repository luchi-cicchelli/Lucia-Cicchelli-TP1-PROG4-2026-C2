import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: '../auth.css'
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  readonly cargando = signal(false);
  readonly error = signal('');
  readonly verPassword = signal(false);

  // Botones para entrar con las cuentas de prueba sin tipear.
  readonly accesos = environment.accesosRapidos;

  async accesoRapido(acceso: { email: string; password: string }) {
    this.form.setValue({ email: acceso.email, password: acceso.password });
    await this.ingresar();
  }

  async ingresar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.cargando.set(true);
    this.error.set('');
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.iniciarSesion(email.trim(), password);

      const volver = this.route.snapshot.queryParamMap.get('volver');
      await this.router.navigateByUrl(volver || this.auth.rutaInicio());
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }
}
