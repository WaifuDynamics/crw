# Push-ups widget — embed guide

A push-up and squat counter you can put on any website. It uses the visitor's
camera to count reps, shows a small preview with the skeleton drawn on the body,
and lets people play **Solo**, **1v1** or **2v2** against other visitors.

The video never leaves the visitor's browser. Only the rep count and a display
name are sent to the game server.

---

## Quick start

Paste this where the widget should appear:

```html
<div data-pushups></div>
<script src="https://pompki.szybki-drop.pl/embed.js" async></script>
```

That's all. The script finds every `data-pushups` element and turns it into the
widget. `example.html` in this package is a working demo page.

---

## Requirements

| | |
|---|---|
| **HTTPS** | Your page must be served over HTTPS (or `localhost` while developing). Browsers only give the camera to secure pages, and that applies to every frame up the chain. |
| **Camera permission** | Each visitor is asked once. Browsers show the prompt for **your** site's address. |
| **Browsers** | Current Chrome, Edge, Firefox and Safari, desktop and mobile. |
| **First load** | ~20 MB (pose model + WebAssembly), cached afterwards. Use `data-model="lite"` for ~6 MB on slow connections. |
| **Content Security Policy** | If your site sends a CSP header, allow the server in `script-src` and `frame-src` (see Troubleshooting). |

---

## Options

Set them as `data-*` attributes on the container:

```html
<div data-pushups
     data-mode="1v1"
     data-name="Alex"
     data-height="600"></div>
```

| attribute | values | default | what it does |
|---|---|---|---|
| `data-exercise` | `pushup` · `squat` | visitor's choice | Fixes the exercise and hides the Push-ups / Squats switch. Squats need the whole body in frame, feet included. |
| `data-mode` | `solo` · `1v1` · `2v2` | — | Skips the mode picker and starts this mode right away. |
| `data-lock-mode` | `true` · `false` | `false` | With `data-mode`: hides the "back to modes" buttons, so visitors stay in that mode. |
| `data-name` | up to 16 chars | — | Pre-fills the player name, e.g. from your site's login. Without it, the server assigns a unique name (Falcon, Otter, …). |
| `data-height` | pixels | `520` | Minimum height. The widget grows to fit its content. |
| `data-auto-height` | `true` · `false` | `true` | Set `false` to keep a fixed height (`data-height`). |
| `data-model` | `full` · `lite` | `full` | `lite` is smaller and faster but a little less accurate. |
| `data-demo` | `true` · `false` | `false` | Plays a built-in recording instead of using the camera. For testing the integration. |
| `data-server` | URL | the script's origin | Game server to use. Only needed if you host your own (see below). |

---

## Events

The widget reports what happens as DOM events on the container. They bubble, so
you can listen on the element or on `document`:

```js
document.addEventListener("pushups:result", (e) => {
  const { won, score, opponents } = e.detail;
  console.log(won ? "Won" : "Lost", score.join(":"), "against", opponents.join(" + "));
});
```

| event | `detail` | when |
|---|---|---|
| `pushups:ready` | `{ cameraAllowed, mode, exercise }` | Camera and pose model are ready. |
| `pushups:mode` | `{ mode, exercise }` | A mode was picked (or started from `data-mode`). |
| `pushups:matchstart` | `{ mode, exercise, target, you, teams }` | The countdown finished and the race began. `teams[0]` is the visitor's team, as lists of names. |
| `pushups:rep` | `{ mode, exercise, count }` | The visitor completed a rep. `count` is their total in this session or match. |
| `pushups:result` | `{ mode, exercise, won, reason, score, opponents }` | A match ended. `reason` is `"target"` or `"walkover"`; `score` is `[yours, theirs]`. |
| `pushups:result` (solo) | `{ mode: "solo", sessionId, exercise, reps, bestSet, seconds }` | The player pressed **Finish** in solo mode (sent only when `reps > 0`). `bestSet` is the most reps without a pause over 5 s. Personal records are kept in the visitor's browser. |
| `pushups:resize` | `{ height }` | Content height changed (already applied when auto-height is on). |
| `pushups:error` | `{ code, message, cameraAllowed }` | The camera or model could not start. `message` is shown to the visitor too. |

Events are only accepted from the widget's own frame on the game server's
origin, so other scripts on the page cannot fake them.

---

## JavaScript API

For single-page apps, or anything that adds the container after the page has
loaded:

```js
const widget = Pushups.mount(document.querySelector("#workout"), {
  mode: "solo",
  name: currentUser.displayName,
  onEvent: (type, detail) => console.log(type, detail),
});

// later, e.g. when the view unmounts
widget.destroy();
```

`mount` accepts the same options as the attributes, in camelCase (`lockMode`,
`autoHeight`, …). Calling `mount` twice on the same element returns the existing
widget. `Pushups.scan()` re-scans the page for new `data-pushups` elements.

### React

```jsx
import { useEffect, useRef } from "react";

export function PushupsWidget(props) {
  const ref = useRef(null);
  useEffect(() => {
    const widget = window.Pushups.mount(ref.current, props);
    return () => widget.destroy();
  }, []);
  return <div ref={ref} />;
}
```

Load `embed.js` once (e.g. in `index.html`) before rendering the component.

---

## Using an iframe directly

If you cannot add scripts (some site builders), embed the page itself:

```html
<iframe src="https://pompki.szybki-drop.pl/?embed=1&mode=solo"
        allow="camera; fullscreen"
        style="width:100%;height:640px;border:0;border-radius:16px"></iframe>
```

`allow="camera"` is required — without it the browser blocks the camera. You lose
auto-height and events; the query parameters are `exercise`, `mode`, `name`,
`lock=1` and `model=lite`.

---

## Matching your colours

By default the widget uses its own dark theme. Pass your palette and it blends in.
Colours are plain 6-digit hex; anything else is ignored.

```html
<div data-pushups
     data-bg="#08090B" data-panel="#17191D" data-line="#2B2E34"
     data-ink="#F7F8FA" data-muted="#969AA3"
     data-me="#168BFF" data-op="#A9F06A" data-onme="#FFFFFF"></div>
```

| attribute | what it paints |
|---|---|
| `data-bg` · `data-panel` · `data-line` | page background, cards, borders |
| `data-ink` · `data-muted` | primary and secondary text |
| `data-me` · `data-op` | your counter and bar · the other side's |
| `data-onme` | text drawn on top of `data-me` (buttons) |
| `data-brand="0"` | hides the widget's own title, for pages that already show one |

---

## Privacy

- Video is processed in the visitor's browser and is never uploaded.
- The game server receives: a display name, the chosen mode, and the rep count.
- Nothing is written to disk and there are no accounts. Match data lives in the
  server's memory and is dropped about a minute after the players leave.
- The widget remembers the visitor's name in the browser's local storage.

Mention the camera use in your own privacy policy if your site has one.

---

## Availability

By default the widget talks to `pompki.szybki-drop.pl`, which is run as a hobby
project, not a hosted service with an uptime guarantee. If it is down, the
widget shows a connection error in the multiplayer modes; **Solo keeps working**
because it never contacts the server once the page has loaded.

For anything that must stay up, host your own server.

---

## Hosting your own server

The server is a small Python program. Ask for the full project, then on a
machine with Python 3.12:

```bash
pip install -r requirements.txt
python -m pushups.server --tunnel                         # temporary public HTTPS URL
python -m pushups.server --hostname pushups.example.com   # your own domain via Cloudflare
```

Point the widget at it:

```html
<div data-pushups data-server="https://pushups.example.com"></div>
<script src="https://pushups.example.com/embed.js" async></script>
```

Players only meet people on the same server doing the same exercise.

---

## Troubleshooting

**"This page does not let the widget use the camera"**
The iframe lost its `allow="camera"` attribute — usually a CMS or sanitizer
stripping it. Use the script embed, or allow the attribute in your CMS.

**Camera prompt never appears**
Your page is on plain `http://`. Serve it over HTTPS.

**Widget area stays empty**
Check the browser console. A Content Security Policy block looks like
*Refused to load the script* or *Refused to frame*. Add:

```
script-src  https://pompki.szybki-drop.pl;
frame-src   https://pompki.szybki-drop.pl;
```

**"The camera is in use by another app"**
Another tab or program (video call, OBS) holds the camera. Close it and reload.

**Reps are not counted**
Stand side-on to the camera. Push-ups need the whole upper body in frame;
squats need the whole body, feet included. The label under the preview says
*can't see you* (or *can't see your legs* for squats) when tracking is lost.

**Testing without a camera**
Add `data-demo="true"` — the widget plays a recorded set of push-ups instead.
