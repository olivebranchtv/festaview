-- Festaview box office cut: the platform keeps a percentage of every ticket sale. Default 20%.
-- The rate can be set per title (a pass, a film ticket, an event ticket, or a theater showing). A blank rate uses the
-- festival's default. Only the network owner can change rates. Safe to re-run. Run AFTER 013.

-- Default for every festival is 20%. Festivals still on the old default of 0 move to 20.
alter table festivals alter column ticket_fee_pct set default 20;
update festivals set ticket_fee_pct = 20 where ticket_fee_pct = 0;

-- Optional per-title rate. Empty means "use the festival's default".
alter table products add column if not exists fee_pct numeric;
alter table cinema_showings add column if not exists fee_pct numeric;
alter table products drop constraint if exists products_fee_pct_check;
alter table products add constraint products_fee_pct_check check (fee_pct is null or fee_pct between 0 and 100);
alter table cinema_showings drop constraint if exists cinema_showings_fee_pct_check;
alter table cinema_showings add constraint cinema_showings_fee_pct_check check (fee_pct is null or fee_pct between 0 and 100);

-- Festival admins can edit their own products, so they must never be able to change the rate.
create or replace function products_guard_fee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    if tg_op = 'INSERT' then new.fee_pct := null; else new.fee_pct := old.fee_pct; end if;
  end if;
  return new;
end $$;
drop trigger if exists products_guard_fee on products;
create trigger products_guard_fee before insert or update on products for each row execute function products_guard_fee();

-- The network owner sets (or clears) a title's rate here. p_kind is 'product' or 'showing'. A null rate clears it.
create or replace function set_ticket_rate(p_kind text, p_id uuid, p_pct numeric) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only the network owner can change rates.'; end if;
  if p_pct is not null and (p_pct < 0 or p_pct > 100) then raise exception 'The rate must be between 0 and 100.'; end if;
  if p_kind = 'product' then
    update products set fee_pct = p_pct where id = p_id;
  elsif p_kind = 'showing' then
    update cinema_showings set fee_pct = p_pct where id = p_id;
  else
    raise exception 'Unknown kind.';
  end if;
  return 'ok';
end $$;
revoke execute on function set_ticket_rate(text, uuid, numeric) from public, anon;
grant execute on function set_ticket_rate(text, uuid, numeric) to authenticated;

-- The owner reads every title's price and rate to manage them (festival admins already read their own).
drop policy if exists "owner reads all products" on products;
create policy "owner reads all products" on products for select using (is_platform_admin());
