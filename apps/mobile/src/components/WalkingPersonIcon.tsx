import React from 'react';
import { Circle, G, Path } from 'react-native-svg';

/** Vector walking figure. Size is its height in the banner's SVG coordinates. */
export default function WalkingPersonIcon({ size = 108 }: { size?: number }) {
  return (
    <G transform={`translate(284 328) scale(${size / 136}) translate(-284 -328)`} fill="#00A8F3">
      <Circle cx={286} cy={273} r={13} />
      <Path d="M278 290 C285 287 290 290 294 298 L302 317 L320 326 C327 329 323 339 316 336 L294 326 L288 313 L287 335 L298 354 L310 388 C313 396 302 400 299 392 L287 362 L276 349 L272 365 L255 392 C250 400 240 393 246 386 L262 360 L266 337 L269 307 L258 316 L256 334 C256 342 245 342 245 334 L247 312 C248 306 252 303 257 299 L269 292 C272 290 275 289 278 290 Z" />
    </G>
  );
}
