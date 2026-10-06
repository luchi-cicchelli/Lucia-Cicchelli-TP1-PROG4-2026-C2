-- Productos y combos de prueba para el candy bar. Correr UNA sola vez.

insert into public.productos_candy (nombre, categoria, precio) values
  ('Pochoclo chico', 'Pochoclos', 3500),
  ('Pochoclo mediano', 'Pochoclos', 4500),
  ('Pochoclo grande', 'Pochoclos', 5500),
  ('Pochoclo dulce grande', 'Pochoclos', 6000),
  ('Gaseosa chica', 'Bebidas', 2800),
  ('Gaseosa grande', 'Bebidas', 4000),
  ('Agua mineral', 'Bebidas', 2500),
  ('Nachos con queso', 'Snacks', 5000),
  ('Chocolate', 'Golosinas', 2200),
  ('Gomitas', 'Golosinas', 2000);

with combo as (
  insert into public.combos (nombre, precio_fijo)
  values ('Combo Clásico', 14000)
  returning id
)
insert into public.combo_items (combo_id, producto_id, cantidad)
select combo.id, p.id, 1
from combo, public.productos_candy p
where p.nombre in ('Pochoclo grande', 'Gaseosa grande');

with combo as (
  insert into public.combos (nombre, precio_fijo)
  values ('Combo Dulce', 13500)
  returning id
)
insert into public.combo_items (combo_id, producto_id, cantidad)
select combo.id, p.id, 1
from combo, public.productos_candy p
where p.nombre in ('Pochoclo dulce grande', 'Gaseosa chica', 'Chocolate');
