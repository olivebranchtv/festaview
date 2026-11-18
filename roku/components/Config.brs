' Festaview configuration. Fill in after the Supabase project is created.
' The anon key is public by design (row level security limits it to published content).
function FestaviewConfig() as object
  return {
    supabaseUrl: "https://ckxwyhyjokpamgygdsoq.supabase.co"
    supabaseAnonKey: "YOUR-ANON-KEY"
  }
end function
