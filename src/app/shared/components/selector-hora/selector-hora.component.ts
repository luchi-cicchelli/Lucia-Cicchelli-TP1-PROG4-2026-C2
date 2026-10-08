import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-selector-hora',
  standalone: true,
  templateUrl: './selector-hora.component.html',
  styleUrl: './selector-hora.component.css'
})
export class SelectorHoraComponent {
  readonly valor = input('18:00');
  readonly cambio = output<string>();

  readonly horas = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  readonly minutos = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

  readonly hora = computed(() => (this.valor() || '18:00').split(':')[0]);
  readonly minuto = computed(() => (this.valor() || '18:00').split(':')[1]);

  elegirHora(evento: Event) {
    this.cambio.emit(`${(evento.target as HTMLSelectElement).value}:${this.minuto()}`);
  }

  elegirMinuto(evento: Event) {
    this.cambio.emit(`${this.hora()}:${(evento.target as HTMLSelectElement).value}`);
  }
}
