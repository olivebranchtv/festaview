' Festaview configuration.
' The anon key is public by design (row level security limits it to published content).
' vastUrl is the ad address the Roku ad library asks for. It is the roku-vast function on the website: it asks Adtelligent first and plays one of
' Festaview's own spots only when Adtelligent has no ad. The {ROKU_ADS_*} placeholders are filled in by AdTask.brs.
function FestaviewConfig() as object
  return {
    supabaseUrl: "https://ckxwyhyjokpamgygdsoq.supabase.co"
    supabaseAnonKey: "sb_publishable_LyDs-buM_wSgTzJoM0ue7Q_ZTrrlizY"
    vastUrl: "https://festaview.com/.netlify/functions/roku-vast?w={ROKU_ADS_CONTENT_WIDTH}&h={ROKU_ADS_CONTENT_HEIGHT}&cb={ROKU_ADS_TIMESTAMP}&ua={ROKU_ADS_USER_AGENT}&uip={ROKU_ADS_EXTERNAL_IP}&model={ROKU_ADS_MODEL}&store={ROKU_ADS_STORE_URL}&tid={ROKU_ADS_TRACKING_ID}"
  }
end function
