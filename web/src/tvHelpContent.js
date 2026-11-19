// Plain text for the "Watch on your TV" help. Shared by the page, the theater room and the search-engine copy.
// Menus differ a little between TV models and software versions, so the steps stay general.

export const TVS = [
  { id: 'roku', name: 'Roku', sub: 'Roku player or Roku TV' },
  { id: 'samsung', name: 'Samsung', sub: 'Samsung Smart TV' },
  { id: 'lg', name: 'LG', sub: 'LG webOS TV' },
  { id: 'fire', name: 'Fire TV', sub: 'Amazon Fire TV' },
  { id: 'google', name: 'Chromecast / Google TV', sub: 'Chromecast, Google TV, Android TV' },
  { id: 'vizio', name: 'Vizio', sub: 'Vizio SmartCast' },
  { id: 'apple', name: 'Apple TV', sub: 'Apple TV box' },
  { id: 'other', name: 'Other TV', sub: 'Any TV with an HDMI port' },
]

export const DEVICES = [
  { id: 'iphone', name: 'iPhone or iPad' },
  { id: 'mac', name: 'Mac' },
  { id: 'windows', name: 'Windows PC' },
  { id: 'android', name: 'Android phone or tablet' },
]

export const TV_NOTES = {
  roku: 'Roku does not support the Chromecast "Cast to TV" button. On a Roku you watch Festaview Cinemas with AirPlay (iPhone, iPad, Mac) or by mirroring your screen (Windows PC, Android). AirPlay works on newer Roku players and TVs; to check yours, open Settings on the Roku and look for Apple AirPlay and HomeKit.',
  samsung: 'Most Samsung TVs from 2018 on support AirPlay. Samsung phones use Smart View. Every Samsung Smart TV also has a built-in web browser, which is the simplest way if nothing else works.',
  lg: 'Most LG TVs from 2019 on support AirPlay. Windows PCs and Android phones can use Screen Share. Every LG webOS TV has a built-in web browser.',
  fire: 'Fire TV does not support the Chromecast "Cast to TV" button. Use screen mirroring from Windows or Android, or open the Silk Browser on the Fire TV.',
  google: 'This is the easiest TV. Chromecast, Google TV and Android TV work with the Cast to TV button in Chrome or Edge.',
  vizio: 'Vizio SmartCast TVs support both Chromecast and AirPlay, so use Cast to TV (Chrome or Edge) or AirPlay (Apple devices).',
  apple: 'Apple TV works with AirPlay from iPhone, iPad and Mac.',
  other: 'Any TV with an HDMI port can show Festaview Cinemas with a cable. If your TV has a built-in web browser, you can also open festaview.com on the TV itself.',
}

const TV_PREP = {
  roku: 'On the Roku, open Settings, then System, then Screen mirroring, and choose Prompt or Always allow.',
  fire: 'On the Fire TV, open Settings, then Display and Sounds, then Enable Display Mirroring.',
  samsung: 'On the Samsung TV, change the input to Screen Mirroring (the Source menu), or open Settings, then Connection.',
  lg: 'On the LG TV, open the Home menu and choose Screen Share.',
  other: 'On the TV, open the screen mirroring input. It may be called Screen Share, Screen Mirroring, Miracast or Smart View.',
}

const same = 'Make sure your device and the TV are on the same Wi-Fi network.'

const airplayApple = (device) => ({
  name: 'AirPlay (recommended)',
  steps: device === 'mac'
    ? [same, 'Open Festaview Cinemas in Safari and enter the theater.', 'Click the AirPlay button under the video, or open Control Center and choose Screen Mirroring.', 'Pick your TV from the list. If the TV shows a code, type it on your Mac.']
    : [same, 'Open Festaview Cinemas in Safari and enter the theater.', 'Tap the AirPlay button under the video, or open Control Center and tap Screen Mirroring.', 'Pick your TV from the list. If the TV shows a code, type it on your iPhone or iPad.'],
})

const castChrome = {
  name: 'Cast to TV (recommended)',
  steps: [same, 'Use Google Chrome or Microsoft Edge and open Festaview Cinemas.', 'Enter the theater and press Cast to TV under the video.', 'Choose your TV. It joins the film at the live point, and chat stays on your device.'],
}

const mirror = (tv, device) => ({
  name: 'Screen mirroring',
  steps: [
    same,
    TV_PREP[tv] || TV_PREP.other,
    device === 'windows'
      ? 'On your PC press the Windows key and K together, then choose your TV.'
      : 'On your phone swipe down to Quick Settings and tap Smart View, Screen Cast or Cast, then choose your TV.',
    'Open Festaview Cinemas in your browser, enter the theater and press Fullscreen.',
  ],
})

const tvBrowser = (tv) => ({
  name: 'Use the TV\'s own web browser',
  steps: [
    tv === 'fire' ? 'Open the Silk Browser from your apps.' : tv === 'lg' ? 'Open the Web Browser app.' : tv === 'samsung' ? 'Open the Internet app.' : 'Open the web browser app on your TV.',
    'Go to festaview.com/cinema and pick the showing.',
    'If it is a ticketed showing, type your ticket code with the on-screen keyboard.',
  ],
})

const hdmi = {
  name: 'HDMI cable (works with every TV)',
  steps: [
    'Plug an HDMI cable from your laptop into the TV. Phones and tablets need an adapter.',
    'Switch the TV to that HDMI input.',
    'Open Festaview Cinemas on your device, enter the theater and press Fullscreen.',
  ],
}

// The ways to get the theater onto a given TV from a given device, best first.
export function optionsFor(tv, device) {
  const out = []
  const apple = device === 'iphone' || device === 'mac'
  if (apple && ['roku', 'samsung', 'lg', 'vizio', 'apple'].includes(tv)) out.push(airplayApple(device))
  if (!apple && ['google', 'vizio'].includes(tv)) out.push(castChrome)
  if (device === 'mac' && ['google', 'vizio'].includes(tv)) out.push(castChrome)
  if (device === 'iphone' && ['google'].includes(tv)) out.push({
    name: 'Chromecast from an iPhone',
    steps: [same, 'iPhone and iPad cannot use the Chromecast button on the website. Open the Google Home app, tap your TV, then Cast my screen, and open Festaview Cinemas in Safari.'],
  })
  if ((device === 'windows' || device === 'android') && ['roku', 'samsung', 'lg', 'fire'].includes(tv)) out.push(mirror(tv, device))
  if (['samsung', 'lg', 'fire', 'other'].includes(tv)) out.push(tvBrowser(tv))
  if (tv === 'apple' && !apple) out.push({ name: 'Apple TV without an Apple device', steps: ['Apple TV is built for AirPlay from Apple devices. From a PC or Android phone, use an HDMI cable, or open the showing on an Apple device.'] })
  out.push(hdmi)
  return out
}

export const GENERAL_TIPS = [
  'Everyone watches at the same moment. Casting or mirroring does not give you pause or rewind, the same as a real theater.',
  'Mirroring shows exactly what is on your screen, so it may run a few seconds behind other viewers. Casting with the Cast to TV button keeps the TV in step with the room.',
  'Keep your phone or computer awake and on the same Wi-Fi as the TV while the film plays.',
  'If the picture stutters, move closer to your router or switch your device to the 5 GHz Wi-Fi network.',
  'Doors open before showtime. You can connect your TV in the lobby so you are ready when the film starts.',
]

export function detectDevice() {
  if (typeof navigator === 'undefined') return 'windows'
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iphone'
  if (/Android/.test(ua)) return 'android'
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac'
  return 'windows'
}
