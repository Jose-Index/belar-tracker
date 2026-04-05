-- BELAR TRACKER — Supabase Schema
-- Ejecutar en el SQL Editor de Supabase

-- 1. SNAP (valores actuales de cada broker)
create table if not exists snap (
  id integer primary key default 1,
  etoro numeric(12,2) not null default 0,
  xtb numeric(12,2) not null default 0,
  ibkr numeric(12,2) not null default 0,
  btc_qty numeric(12,8) not null default 0,
  updated_at timestamptz not null default now()
);

-- Fila única con id=1
insert into snap (id, etoro, xtb, ibkr, btc_qty)
values (1, 10133.09, 8125.65, 2320.32, 0.01470635)
on conflict (id) do nothing;

-- 2. NOTAS DE SEGUIMIENTO
create table if not exists notas (
  id bigserial primary key,
  ticker text not null,
  texto text not null,
  fecha text not null,
  created_at timestamptz not null default now()
);

-- 3. APORTACIONES DE CAPITAL
create table if not exists aportaciones (
  id bigserial primary key,
  fecha text not null,
  broker text not null,
  importe_eur numeric(10,2) not null default 0,
  importe_usd numeric(10,2),
  created_at timestamptz not null default now()
);

-- Datos históricos de aportaciones
insert into aportaciones (fecha, broker, importe_eur, importe_usd) values
('31/03/24','etoro',100,106.44),('23/05/24','etoro',100,106.73),
('20/06/24','etoro',100,105.73),('22/07/24','etoro',100,108.85),
('14/08/24','etoro',100,110.37),('04/09/24','btc',160,177.31),
('19/09/24','etoro',100,110.37),('08/10/24','etoro',100,108.96),
('05/11/24','etoro',100,108.53),('02/12/24','etoro',6800,7091.18),
('05/12/24','xtb',5155.68,5168.00),('17/12/24','etoro',200,null),
('23/12/24','etoro',144.32,149.77),('07/01/25','etoro',290,null),
('20/01/25','etoro',105,118.99),('01/03/25','etoro',210,216.56),
('09/04/25','etoro',105,111.31),('05/05/25','etoro',105,null),
('12/06/25','etoro',105,120.00),('15/07/25','etoro',105,122.67),
('06/08/25','etoro',105,121.59),('08/09/25','etoro',105,123.03),
('23/09/25','ibkr',350,413.53),('12/10/25','etoro',105,121.31),
('13/10/25','ibkr',350,405.49),('04/11/25','etoro',105,119.88),
('04/11/25','ibkr',350,400.87),('03/12/25','etoro',105,121.81),
('03/12/25','ibkr',350,408.42),('08/01/26','etoro',110,127.49),
('08/01/26','ibkr',360,417.65),('04/02/26','etoro',110,129.67),
('04/02/26','ibkr',360,424.45),('02/03/26','btc',259,304.83),
('05/03/26','etoro',110,127.35),('05/03/26','ibkr',360,417.14);

-- 4. HISTÓRICO SEMANAL (cierres adicionales post-28/03/26)
create table if not exists wb_extra (
  id bigserial primary key,
  fecha text not null unique,
  etoro numeric(12,2) not null default 0,
  xtb numeric(12,2) not null default 0,
  ibkr numeric(12,2) not null default 0,
  btc_usd numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

-- RLS: acceso público de lectura y escritura (anon key)
alter table snap enable row level security;
alter table notas enable row level security;
alter table aportaciones enable row level security;
alter table wb_extra enable row level security;

create policy "public read snap" on snap for select using (true);
create policy "public update snap" on snap for update using (true);

create policy "public read notas" on notas for select using (true);
create policy "public insert notas" on notas for insert with check (true);
create policy "public delete notas" on notas for delete using (true);

create policy "public read aportaciones" on aportaciones for select using (true);
create policy "public insert aportaciones" on aportaciones for insert with check (true);
create policy "public delete aportaciones" on aportaciones for delete using (true);

create policy "public read wb_extra" on wb_extra for select using (true);
create policy "public insert wb_extra" on wb_extra for insert with check (true);
create policy "public update wb_extra" on wb_extra for update using (true);
