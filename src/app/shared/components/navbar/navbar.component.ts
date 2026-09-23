import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent {
  readonly auth = inject(AuthService);
  readonly menuAbierto = signal(false);

  constructor() {
    // Cierra el menú mobile al navegar.
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.menuAbierto.set(false));
  }

  toggleMenu() {
    this.menuAbierto.update((v) => !v);
  }

  async salir() {
    await this.auth.cerrarSesion();
  }
}
