import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const fechaNacimientoValida: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const valor: string = control.value;
  if (!valor) return null;
  const hoy = new Date().toISOString().slice(0, 10);
  if (valor > hoy) return { fechaFutura: true };
  if (valor < '1900-01-01') return { fechaInvalida: true };
  return null;
};
