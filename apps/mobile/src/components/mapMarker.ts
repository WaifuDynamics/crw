// The "you are here" marker, shared by the web map (Leaflet in the page) and the native
// map (Leaflet inside the WebView). A fitness tracker's puck rather than a plain pin: a
// blue core in a white rim with a lime pulse breathing out of it while the fix is live.

/** Size of the marker box, in pixels. The pulse is allowed to grow past it. */
export const ME_ICON_SIZE = 28;

export const ME_ICON_HTML =
  '<div class="crw-me-puck"><span class="crw-me-pulse"></span><span class="crw-me-core"></span></div>';

/** CSS for the marker. Injected on the web page and inlined in the WebView document. */
export const ME_MARKER_CSS = `
.crw-me, .crw-pin, .crw-route-marker { background: none; border: none; }
.crw-me-puck { position: relative; width: ${ME_ICON_SIZE}px; height: ${ME_ICON_SIZE}px; }
.crw-me-core, .crw-me-pulse {
  position: absolute; left: 50%; top: 50%; width: 16px; height: 16px;
  margin: -8px 0 0 -8px; border-radius: 50%;
}
.crw-me-core {
  background: #168BFF; border: 3px solid #fff;
  box-shadow: 0 2px 7px rgba(0,0,0,.45), 0 0 0 5px rgba(22,139,255,.22);
}
.crw-me-pulse { border: 2px solid #A9F06A; animation: crw-me-pulse 1.9s ease-out infinite; }
@keyframes crw-me-pulse {
  0% { transform: scale(.7); opacity: .7 }
  70% { opacity: 0 }
  100% { transform: scale(2.7); opacity: 0 }
}
@media (prefers-reduced-motion: reduce) { .crw-me-pulse { animation: none; opacity: .3 } }
`;
