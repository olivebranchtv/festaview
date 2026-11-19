# Paid access (tickets, passes, access codes)

## How it works
- Each film is Free or Ticketed (Films tab, "Who can watch").
- Ticketed films are locked: the public never receives their video link. Visitors read films from the `films_public`
  view, which blanks `video_url` for ticketed films. `unlock_stream(film, code)` returns the link only for a valid code.
- Access codes (FV-XXXX-XXXX-XXXX) come from card purchases or from the festival's free codes (Access and sales tab).
  A code works for one film or for all ticketed films of the festival, and can expire or be revoked.
- Passes (all ticketed films) and tickets (one film) are products with a price set by the festival.
- Card payments use Stripe Checkout through three Netlify functions in web/netlify/functions:
  checkout (starts payment, price read from the database), stripe-webhook (creates the code after payment,
  verifies Stripe's signature, safe if delivered twice), claim (shows the buyer their code after paying).
- Festaview (network owner) switches payments on per festival and sets its fee percentage in the network console.

## Setup
1. Deploy the website first, then run supabase/migrations/008_paid_access.sql (the site falls back until it exists).
2. Create a Stripe account. Use TEST mode first.
3. In Netlify, Site configuration, Environment variables (tick "contains secret values" for all three):
   - STRIPE_SECRET_KEY
   - STRIPE_WEBHOOK_SECRET (from step 4)
   - SUPABASE_SERVICE_ROLE_KEY (Supabase, Project Settings, API; server only, never in the website code)
4. In Stripe, Developers, Webhooks, add endpoint https://<your-site>/.netlify/functions/stripe-webhook for events
   checkout.session.completed and checkout.session.async_payment_succeeded. Copy its signing secret into step 3.
5. In the network console, Festivals tab: tick Payments for a festival and set the fee %.
6. Test with Stripe's test card 4242 4242 4242 4242 before going live.
Netlify should list the functions in the deploy log. If it does not, check that netlify/functions is detected under base "web".

## Known limits
- Money is collected in Festaview's Stripe account. Payouts to festivals are manual (the Access and sales tab shows
  gross, fee and net). Stripe Connect would automate this later.
- Refunds are manual: revoke the code, then refund in Stripe.
- A code is a bearer token: whoever has it can watch, and it can be shared. Once the stream link is returned to an
  authorised viewer it can be copied. Stronger protection needs signed, expiring video links or DRM at the video host
  (verify Bunny token authentication / MediaCage).
- Ticketed films do not play on Roku or in automatic channels.
- Card payment code is covered by automated tests with fake Stripe and database responses, but has NOT been run
  against real Stripe.
