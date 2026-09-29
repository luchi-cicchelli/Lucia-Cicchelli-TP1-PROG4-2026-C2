export type Rol = 'cliente' | 'admin' | 'empleado';

export interface Perfil {
  id: string;
  email: string | null;
  nombre: string;
  apellido: string;
  fecha_nacimiento: string; 
  tipo_sangre: string | null;
  color_ojos: string | null;
  dias_vacaciones_anuales: number | null;
  rol: Rol;
  puntos_acumulados: number;
  credito_disponible: number;
  cupon_bienvenida_usado: boolean;
  created_at: string;
}

export type DatosPersonales = Pick<
  Perfil,
  'nombre' | 'apellido' | 'fecha_nacimiento' | 'tipo_sangre' | 'color_ojos' | 'dias_vacaciones_anuales'
>;

export interface RegistroDatos extends DatosPersonales {
  email: string;
  password: string;
}

export const TIPOS_SANGRE = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', '0+', '0-'];

export const COLORES_OJOS = ['Marrón', 'Negro', 'Miel', 'Verde', 'Azul', 'Gris', 'Otro'];

export const ROLES: { valor: Rol; etiqueta: string }[] = [
  { valor: 'cliente', etiqueta: 'Cliente' },
  { valor: 'empleado', etiqueta: 'Empleado' },
  { valor: 'admin', etiqueta: 'Administrador' }
];

export function calcularEdad(fechaNacimiento: string, hoy = new Date()): number {
  const [anio, mes, dia] = fechaNacimiento.split('-').map(Number);
  let edad = hoy.getFullYear() - anio;
  const yaCumplio =
    hoy.getMonth() + 1 > mes || (hoy.getMonth() + 1 === mes && hoy.getDate() >= dia);
  if (!yaCumplio) edad--;
  return edad;
}
